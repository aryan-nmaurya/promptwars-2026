"""Repository evaluation API: ownership, evidence, caching, and readback."""

from __future__ import annotations

from httpx import AsyncClient

from app.services.evaluator import assessable_categories
from app.services.gemini import GeneratedEvaluation
from app.services.github import EvidenceFile, GitHubRepoRef, RepositoryEvidence
from tests.conftest import StubGemini

PAYLOAD = {"interests": "healthcare", "skills": "python"}


def _evidence() -> RepositoryEvidence:
    return RepositoryEvidence(
        repository=GitHubRepoRef(owner="acme", repository="demo"),
        default_branch="main",
        commit_sha="a" * 40,
        repository_size_kib=12,
        tree_complete=True,
        tree_entries_reported=2,
        tree_entries_processed=2,
        files_considered=2,
        bytes_analyzed=99,
        files=(
            EvidenceFile(
                path="README.md",
                sha="b" * 40,
                size_bytes=47,
                relevance_score=100,
                content="The project can create, list, and update records.",
            ),
            EvidenceFile(
                path="app/routes.py",
                sha="c" * 40,
                size_bytes=52,
                relevance_score=90,
                content="def create_record():\n    return save_valid_record()",
            ),
        ),
        limitations=("Static inspection only; repository code was not executed.",),
    )


async def _make_project(client: AsyncClient) -> tuple[dict, str]:
    ideas = (await client.post("/ideas", json=PAYLOAD)).json()
    created = (await client.post("/projects", json={"idea_id": ideas["ideas"][0]["id"]})).json()
    return created["project"], created["edit_token"]


async def _mock_collect(self, repository_url: str, *, planned_keywords=()):  # type: ignore[no-untyped-def]
    assert repository_url == "https://github.com/acme/demo"
    assert list(planned_keywords)
    return _evidence()


async def test_owner_can_evaluate_and_public_page_reads_latest_result(
    client: AsyncClient, gemini: StubGemini, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    from app.services.github import GitHubEvidenceCollector

    monkeypatch.setattr(GitHubEvidenceCollector, "collect", _mock_collect)
    project, token = await _make_project(client)

    response = await client.post(
        f"/projects/{project['id']}/evaluate",
        json={"github_url": "https://github.com/acme/demo"},
        headers={"x-project-edit-token": token},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["repository"]["commit_sha"] == "a" * 40
    assert body["repository"]["full_name"] == "acme/demo"
    # The fixture supplies a README and one route, so architecture, code quality
    # and documentation can be scored; nothing in it speaks to testing or to a
    # security control, so both are reported as unmeasured rather than guessed.
    assert body["scores"]["feature_completion"] == 100
    assert body["scores"]["testing"] is None, "no test evidence must not become a number"
    assert body["scores"]["security"] is None
    assert body["unassessed_categories"] == ["testing", "security"]
    assert any("Not scored" in item for item in body["limitations"])
    # Weighted over the assessed categories only, so the unmeasured tenths are
    # not silently charged against the repository.
    assert body["overall_score"] == 87
    assert all(item["evidence"][0]["path"] == "app/routes.py" for item in body["planned_vs_built"])
    assert "evaluate" in gemini.calls

    public = (await client.get(f"/projects/{project['id']}")).json()
    assert public["latest_evaluation"]["id"] == body["id"]
    assert "edit_token" not in public


async def test_same_commit_reuses_immutable_evaluation(
    client: AsyncClient, gemini: StubGemini, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    from app.services.github import GitHubEvidenceCollector

    monkeypatch.setattr(GitHubEvidenceCollector, "collect", _mock_collect)
    project, token = await _make_project(client)
    request = {
        "json": {"github_url": "https://github.com/acme/demo"},
        "headers": {"x-project-edit-token": token},
    }

    first = await client.post(f"/projects/{project['id']}/evaluate", **request)
    second = await client.post(f"/projects/{project['id']}/evaluate", **request)

    assert first.json()["id"] == second.json()["id"]
    assert gemini.calls.count("evaluate") == 1


async def test_shared_view_cannot_trigger_paid_evaluation(client: AsyncClient) -> None:
    project, _token = await _make_project(client)

    response = await client.post(
        f"/projects/{project['id']}/evaluate",
        json={"github_url": "https://github.com/acme/demo"},
    )

    assert response.status_code == 403
    assert response.json() == {"error": "This shared project is read-only"}


async def test_readme_claim_alone_cannot_prove_implementation(
    client: AsyncClient, gemini: StubGemini, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    from app.services.github import GitHubEvidenceCollector

    monkeypatch.setattr(GitHubEvidenceCollector, "collect", _mock_collect)
    project, token = await _make_project(client)

    async def invalid_evidence(**_kwargs):  # type: ignore[no-untyped-def]
        result = await StubGemini().evaluate_repository(
            plan="plan", repository_evidence="evidence", deterministic_summary="summary"
        )
        for item in result.planned_vs_built:
            item.evidence[0].path = "README.md"
        return GeneratedEvaluation.model_validate(result.model_dump())

    monkeypatch.setattr(gemini, "evaluate_repository", invalid_evidence)
    response = await client.post(
        f"/projects/{project['id']}/evaluate",
        json={"github_url": "https://github.com/acme/demo"},
        headers={"x-project-edit-token": token},
    )

    assert response.status_code == 201
    assert {item["status"] for item in response.json()["planned_vs_built"]} == {
        "insufficient_evidence"
    }
    assert all(
        item["evidence"][0]["path"] == "README.md" for item in response.json()["planned_vs_built"]
    )


def _file(path: str, content: str = "x = 1", redactions: int = 0) -> EvidenceFile:
    return EvidenceFile(
        path=path,
        sha="d" * 40,
        size_bytes=len(content),
        relevance_score=90,
        content=content,
        redactions=redactions,
    )


def _evidence_with(*files: EvidenceFile) -> RepositoryEvidence:
    return RepositoryEvidence(
        repository=GitHubRepoRef(owner="acme", repository="demo"),
        default_branch="main",
        commit_sha="a" * 40,
        repository_size_kib=12,
        tree_complete=True,
        tree_entries_reported=len(files),
        tree_entries_processed=len(files),
        files_considered=len(files),
        bytes_analyzed=sum(item.size_bytes for item in files),
        files=files,
    )


def test_a_file_that_merely_mentions_the_redaction_marker_is_not_a_secret() -> None:
    """Searching finished content for the marker made a tool grade its own source.

    The marker appears verbatim in any code that performs or counts redaction,
    so a string search could not tell a redacted credential from a security
    tool's own implementation - and capped that repository's security score on
    the strength of it. Only the collector that did the replacing knows.
    """

    mentions_marker = _file("app/scan.py", 'count("[REDACTED CREDENTIAL]")', redactions=0)
    assert assessable_categories(_evidence_with(mentions_marker))["security"] is False

    really_redacted = _file("app/settings.py", "KEY = [REDACTED CREDENTIAL]", redactions=1)
    assert assessable_categories(_evidence_with(really_redacted))["security"] is True


def test_a_category_with_no_supporting_evidence_is_not_scored() -> None:
    """Reporting a number for something unseen is a guess wearing a measurement."""

    assessable = assessable_categories(_evidence_with(_file("app/routes.py")))
    assert assessable["architecture"] is True
    assert assessable["testing"] is False
    assert assessable["documentation"] is False
    assert assessable["security"] is False
    # Always computable: it comes from the frozen plan, not the repository.
    assert assessable["feature_completion"] is True


def test_security_becomes_assessable_once_a_control_is_analyzed() -> None:
    assessable = assessable_categories(_evidence_with(_file("app/auth/session.py")))
    assert assessable["security"] is True


async def test_an_unassessed_category_never_drags_the_overall_score_down(
    client: AsyncClient, gemini: StubGemini, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    """Excluding a category must renormalise, not charge its weight as a zero."""

    from app.services.github import GitHubEvidenceCollector

    monkeypatch.setattr(GitHubEvidenceCollector, "collect", _mock_collect)
    project, token = await _make_project(client)
    body = (
        await client.post(
            f"/projects/{project['id']}/evaluate",
            json={"github_url": "https://github.com/acme/demo"},
            headers={"x-project-edit-token": token},
        )
    ).json()

    scored = {name: value for name, value in body["scores"].items() if value is not None}
    assert body["overall_score"] >= min(scored.values())
    assert body["overall_score"] <= max(scored.values())
