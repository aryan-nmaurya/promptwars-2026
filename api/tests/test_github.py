"""Security boundaries and selection behavior for GitHub evidence collection."""

from __future__ import annotations

import asyncio
import base64
from collections.abc import Callable

import httpx
import pytest

from app.services.github import (
    GITHUB_API_BASE,
    GitHubEvidenceCollector,
    GitHubLimits,
    GitHubProtocolError,
    GitHubRateLimited,
    GitHubRepositoryMoved,
    GitHubRepositoryRejected,
    GitHubTimeout,
    InvalidGitHubURL,
    is_safe_text_path,
    parse_github_repository_url,
    planned_keyword_tokens,
    relevance_score,
)

COMMIT_SHA = "a" * 40


def _sha(number: int) -> str:
    return f"{number:040x}"


def _json_response(payload: object, status: int = 200, **headers: str) -> httpx.Response:
    return httpx.Response(status, json=payload, headers=headers)


def _blob(content: bytes) -> httpx.Response:
    encoded = base64.b64encode(content).decode()
    # GitHub may line-wrap blob content; the collector must accept whitespace
    # without accepting non-base64 characters.
    encoded = "\n".join(encoded[index : index + 60] for index in range(0, len(encoded), 60))
    return _json_response({"encoding": "base64", "content": encoded})


def _api_handler(
    entries: list[dict[str, object]],
    contents: dict[str, bytes] | None = None,
    *,
    metadata: dict[str, object] | None = None,
    truncated: bool = False,
    requests: list[httpx.Request] | None = None,
) -> Callable[[httpx.Request], httpx.Response]:
    blob_contents = contents or {}
    repo_metadata = metadata or {"private": False, "size": 128, "default_branch": "main"}

    def handler(request: httpx.Request) -> httpx.Response:
        if requests is not None:
            requests.append(request)
        path = request.url.path
        if path == "/repos/acme/demo":
            return _json_response(repo_metadata)
        if path == "/repos/acme/demo/commits/main":
            return _json_response({"sha": COMMIT_SHA})
        if path == f"/repos/acme/demo/git/trees/{COMMIT_SHA}":
            assert dict(request.url.params) == {"recursive": "1"}
            return _json_response({"tree": entries, "truncated": truncated})
        prefix = "/repos/acme/demo/git/blobs/"
        if path.startswith(prefix):
            sha = path.removeprefix(prefix)
            if sha not in blob_contents:
                return _json_response({"message": "not found"}, status=404)
            return _blob(blob_contents[sha])
        return _json_response({"message": "unexpected"}, status=500)

    return handler


def _collector(
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    limits: GitHubLimits | None = None,
    token: str | None = None,
) -> tuple[GitHubEvidenceCollector, httpx.AsyncClient]:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return GitHubEvidenceCollector(client=client, limits=limits, token=token), client


@pytest.mark.parametrize(
    "url",
    [
        "http://github.com/acme/demo",
        "https://api.github.com/acme/demo",
        "https://gist.github.com/acme/demo",
        "https://github.com.evil.example/acme/demo",
        "https://user@github.com/acme/demo",
        "https://github.com:443/acme/demo",
        "https://github.com/acme/demo?tab=readme",
        "https://github.com/acme/demo#readme",
        "https://github.com/acme/demo/issues",
        "https://github.com/acme/repo%2Fissues",
        "https://github.com/-acme/demo",
        "https://github.com/acme/.git",
        " git@github.com:acme/demo.git ",
    ],
)
def test_parser_rejects_every_noncanonical_or_ambiguous_url(url: str) -> None:
    with pytest.raises(InvalidGitHubURL):
        parse_github_repository_url(url)


@pytest.mark.parametrize(
    ("url", "owner", "repository"),
    [
        ("https://github.com/acme/demo", "acme", "demo"),
        ("https://github.com/acme/demo.git", "acme", "demo"),
        ("https://github.com/acme/demo/", "acme", "demo"),
        ("https://github.com/Acme-Co/demo.py", "acme-co", "demo.py"),
    ],
)
def test_parser_accepts_only_repository_urls(url: str, owner: str, repository: str) -> None:
    parsed = parse_github_repository_url(url)

    assert parsed.owner == owner
    assert parsed.repository == repository
    assert parsed.canonical_url == f"https://github.com/{owner}/{repository}"


async def test_collection_is_commit_pinned_and_uses_only_the_hard_coded_api_host() -> None:
    requests: list[httpx.Request] = []
    readme_sha = _sha(1)
    entries = [{"type": "blob", "path": "README.md", "sha": readme_sha, "size": 7}]
    collector, client = _collector(
        _api_handler(entries, {readme_sha: b"Project"}, requests=requests),
        # This test is about commit pinning and the host allowlist, so it opts
        # out of the size floor rather than padding its fixture to clear it.
        limits=GitHubLimits(min_file_bytes=0),
        token="server-token",
    )
    try:
        result = await collector.collect("https://github.com/acme/demo")
    finally:
        await client.aclose()

    assert result.commit_sha == COMMIT_SHA
    assert result.default_branch == "main"
    assert result.files[0].content == "Project"
    assert result.files_analyzed == 1
    assert result.bytes_analyzed == 7
    assert all(
        f"{request.url.scheme}://{request.url.host}" == GITHUB_API_BASE for request in requests
    )
    assert all(request.headers["authorization"] == "Bearer server-token" for request in requests)
    assert requests[-1].url.path.endswith(readme_sha)


async def test_selection_prioritizes_plan_evidence_and_skips_unsafe_paths() -> None:
    candidates = [
        ("src/reminder/routes.py", b"route"),
        ("README.md", b"readme"),
        ("package.json", b"{}"),
        ("tests/test_reminders.py", b"test"),
        (".env", b"SECRET=bad"),
        ("node_modules/pkg/index.js", b"vendor"),
        ("dist/app.js", b"generated"),
        ("package-lock.json", b"lock"),
        ("assets/logo.png", b"binary"),
        ("src/too-large.py", b"x" * 30),
    ]
    entries: list[dict[str, object]] = []
    contents: dict[str, bytes] = {}
    path_for_sha: dict[str, str] = {}
    for index, (path, content) in enumerate(candidates, start=1):
        sha = _sha(index)
        entries.append({"type": "blob", "path": path, "sha": sha, "size": len(content)})
        contents[sha] = content
        path_for_sha[sha] = path
    requests: list[httpx.Request] = []
    limits = GitHubLimits(max_files=3, max_file_bytes=20, max_total_bytes=50, min_file_bytes=0)
    collector, client = _collector(
        _api_handler(entries, contents, requests=requests), limits=limits
    )
    try:
        result = await collector.collect(
            "https://github.com/acme/demo", planned_keywords=["follow-up reminders"]
        )
    finally:
        await client.aclose()

    paths = [file.path for file in result.files]
    # The README and the manifest are taken before anything competes for the
    # remaining slots, and the route that implements the planned feature
    # outranks the test that merely exercises it.
    assert paths == ["README.md", "package.json", "src/reminder/routes.py"]
    fetched_shas = [request.url.path.rsplit("/", 1)[-1] for request in requests[3:]]
    assert {path_for_sha[sha] for sha in fetched_shas} == set(paths)
    assert all(".env" not in request.url.path for request in requests)
    assert result.files_considered == 4
    assert any("capped" in limitation for limitation in result.limitations)


async def test_tree_processing_is_bounded_and_reports_incomplete_coverage() -> None:
    entries = [
        {"type": "blob", "path": f"src/file_{index}.py", "sha": _sha(index), "size": 1}
        for index in range(1, 7)
    ]
    contents = {_sha(index): b"x" for index in range(1, 4)}
    limits = GitHubLimits(max_tree_entries=3, max_files=3, min_file_bytes=0)
    collector, client = _collector(_api_handler(entries, contents), limits=limits)
    try:
        result = await collector.collect("https://github.com/acme/demo")
    finally:
        await client.aclose()

    assert result.tree_entries_reported == 6
    assert result.tree_entries_processed == 3
    assert result.tree_complete is False
    assert {file.path for file in result.files} == {
        "src/file_1.py",
        "src/file_2.py",
        "src/file_3.py",
    }
    assert any("tree was incomplete" in limitation.lower() for limitation in result.limitations)


@pytest.mark.parametrize(
    "metadata",
    [
        {"private": True, "size": 1, "default_branch": "main"},
        {"private": False, "size": 101, "default_branch": "main"},
    ],
)
async def test_private_and_oversized_repositories_are_rejected_before_tree_fetch(
    metadata: dict[str, object],
) -> None:
    requests: list[httpx.Request] = []
    limits = GitHubLimits(max_repository_kib=100)
    collector, client = _collector(
        _api_handler([], metadata=metadata, requests=requests), limits=limits
    )
    try:
        with pytest.raises(GitHubRepositoryRejected):
            await collector.collect("https://github.com/acme/demo")
    finally:
        await client.aclose()

    assert len(requests) == 1


async def test_binary_invalid_and_secret_content_never_reaches_the_evidence_pack() -> None:
    files = {
        _sha(1): b"API_KEY='super-secret-value'\nprint('ok')",
        _sha(2): b"not text\x00payload",
        _sha(3): b"\xff\xfe\xfd",
    }
    entries = [
        {"type": "blob", "path": "src/config.py", "sha": _sha(1), "size": len(files[_sha(1)])},
        {"type": "blob", "path": "notes.txt", "sha": _sha(2), "size": len(files[_sha(2)])},
        {"type": "blob", "path": "legacy.txt", "sha": _sha(3), "size": len(files[_sha(3)])},
    ]
    collector, client = _collector(
        _api_handler(entries, files), limits=GitHubLimits(min_file_bytes=0)
    )
    try:
        result = await collector.collect("https://github.com/acme/demo")
    finally:
        await client.aclose()

    assert [file.path for file in result.files] == ["src/config.py"]
    assert "super-secret-value" not in result.files[0].content
    assert "[REDACTED]" in result.files[0].content
    assert any("binary" in limitation.lower() for limitation in result.limitations)


async def test_declared_sizes_bound_file_count_and_total_analyzed_bytes() -> None:
    entries = [
        {"type": "blob", "path": f"src/{index}.py", "sha": _sha(index), "size": 4}
        for index in range(1, 5)
    ]
    contents = {_sha(index): b"data" for index in range(1, 5)}
    limits = GitHubLimits(max_files=4, max_file_bytes=4, max_total_bytes=8)
    collector, client = _collector(_api_handler(entries, contents), limits=limits)
    try:
        result = await collector.collect("https://github.com/acme/demo")
    finally:
        await client.aclose()

    assert result.files_analyzed == 2
    assert result.bytes_analyzed == 8


async def test_rate_limit_is_typed_and_preserves_retry_hint() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return _json_response(
            {"message": "rate limited"},
            status=403,
            **{"x-ratelimit-remaining": "0", "x-ratelimit-reset": "12345"},
        )

    collector, client = _collector(handler)
    try:
        with pytest.raises(GitHubRateLimited) as error:
            await collector.collect("https://github.com/acme/demo")
    finally:
        await client.aclose()

    assert error.value.retry_after == "1", "past reset timestamps become a one-second hint"


async def test_oversized_json_response_is_rejected_even_when_status_is_success() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return _json_response({"padding": "x" * 1_000})

    limits = GitHubLimits(max_metadata_response_bytes=100)
    collector, client = _collector(handler, limits=limits)
    try:
        with pytest.raises(GitHubProtocolError, match="byte limit"):
            await collector.collect("https://github.com/acme/demo")
    finally:
        await client.aclose()


async def test_total_deadline_cancels_a_slow_transport() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(0.05)
        return _json_response({"private": False, "size": 1, "default_branch": "main"})

    limits = GitHubLimits(request_timeout_seconds=0.01, total_timeout_seconds=0.01)
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    collector = GitHubEvidenceCollector(client=client, limits=limits)
    try:
        with pytest.raises(GitHubTimeout):
            await collector.collect("https://github.com/acme/demo")
    finally:
        await client.aclose()


def test_path_filters_and_keyword_scoring_are_deterministic() -> None:
    assert is_safe_text_path("src/reminders/service.py") is True
    assert is_safe_text_path(".github/workflows/test.yml") is True
    assert is_safe_text_path("node_modules/package/index.js") is False
    assert is_safe_text_path("../escape.py") is False
    assert is_safe_text_path("config/private.pem") is False
    assert planned_keyword_tokens("Follow-up reminders and notifications") >= {
        "reminder",
        "notification",
    }
    planned = planned_keyword_tokens(["Follow-up reminders"])
    assert relevance_score("src/reminder/service.py", planned) > relevance_score(
        "src/unrelated/helpers.py", planned
    )


async def test_a_renamed_repository_is_a_client_error_not_a_server_fault() -> None:
    """Renaming a repo is common; the student must be told, not shown a 5xx."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(301, headers={"location": "https://api.github.com/repos/new/name"})

    client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler), follow_redirects=False, trust_env=False
    )
    collector = GitHubEvidenceCollector(client=client, token=None)

    with pytest.raises(GitHubRepositoryMoved) as caught:
        await collector.collect("https://github.com/old/name")

    assert "renamed or transferred" in str(caught.value)


@pytest.mark.parametrize("token", [None, "server-token"])
async def test_rate_limit_errors_report_whether_a_server_token_was_used(
    token: str | None,
) -> None:
    """A shared 60/hour allowance and an exhausted 5000 need different responses."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, headers={"x-ratelimit-remaining": "0"}, json={})

    client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler), follow_redirects=False, trust_env=False
    )
    collector = GitHubEvidenceCollector(client=client, token=token)

    with pytest.raises(GitHubRateLimited) as caught:
        await collector.collect("https://github.com/owner/repo")

    assert caught.value.authenticated is (token is not None)


def test_a_container_directory_never_outranks_the_layer_that_names_itself() -> None:
    """A monorepo's top-level `api/` inflated every file beneath it equally.

    While it granted the same architecture bonus as `services/`, the database
    wiring, the config and the empty package markers under `api/` all tied with
    the service layer that implements the planned features, and won the budget
    on an alphabetical tiebreak.
    """

    assert relevance_score("api/app/services/evaluator.py") > relevance_score("api/app/db.py")
    assert relevance_score("api/app/routers/mentor.py") > relevance_score("api/app/config.py")
    # Non-source text in a source directory describes nothing it sits next to.
    assert relevance_score("api/app/services/gemini.py") > relevance_score("api/.gitignore")


def test_implementation_outranks_the_tests_that_exercise_it() -> None:
    """`test_reminders.py` says a feature was tested, never that it was built."""

    planned = planned_keyword_tokens(["follow-up reminders"])
    assert relevance_score("src/services/reminders.py", planned) > relevance_score(
        "tests/test_reminders.py", planned
    )


async def test_empty_and_trivial_files_are_never_fetched_as_evidence() -> None:
    """An empty package marker costs a request and a slot while proving nothing."""

    body = b"x" * 200
    entries = [
        {"type": "blob", "path": "src/app/__init__.py", "sha": _sha(1), "size": 0},
        {"type": "blob", "path": "src/app/services/reminders.py", "sha": _sha(2), "size": 200},
    ]
    collector, client = _collector(_api_handler(entries, {_sha(2): body}))
    try:
        result = await collector.collect("https://github.com/acme/demo")
    finally:
        await client.aclose()

    assert [file.path for file in result.files] == ["src/app/services/reminders.py"]


async def test_the_readme_is_analyzed_even_when_richer_files_outscore_it() -> None:
    """Documentation is a scored category; evaluating a repo unread is indefensible."""

    body = b"y" * 300
    entries = [{"type": "blob", "path": "README.md", "sha": _sha(99), "size": 300}]
    contents = {_sha(99): body}
    for index in range(1, 6):
        sha = _sha(index)
        entries.append(
            {"type": "blob", "path": f"src/routes/feature_{index}.py", "sha": sha, "size": 300}
        )
        contents[sha] = body

    collector, client = _collector(
        _api_handler(entries, contents), limits=GitHubLimits(max_files=2)
    )
    try:
        result = await collector.collect(
            "https://github.com/acme/demo", planned_keywords=["feature"]
        )
    finally:
        await client.aclose()

    assert result.files[0].path == "README.md"


async def test_tests_cannot_consume_the_whole_evidence_budget() -> None:
    """A well-tested repo must not spend every slot proving only that it has tests."""

    body = b"z" * 200
    entries: list[dict[str, object]] = []
    contents: dict[str, bytes] = {}
    for index in range(1, 9):
        sha = _sha(index)
        entries.append({"type": "blob", "path": f"tests/test_{index}.py", "sha": sha, "size": 200})
        contents[sha] = body
    for index in range(20, 23):
        sha = _sha(index)
        entries.append({"type": "blob", "path": f"src/lib/mod_{index}.py", "sha": sha, "size": 200})
        contents[sha] = body

    collector, client = _collector(
        _api_handler(entries, contents), limits=GitHubLimits(max_files=8, max_test_files=2)
    )
    try:
        result = await collector.collect("https://github.com/acme/demo")
    finally:
        await client.aclose()

    selected = [file.path for file in result.files]
    assert sum(1 for path in selected if path.startswith("tests/")) == 2
    assert any(path.startswith("src/lib/") for path in selected)


def test_derived_limits_never_contradict_a_lowered_ceiling() -> None:
    """Shrinking one budget must not force the caller to remember the others."""

    limits = GitHubLimits(max_file_bytes=16, max_files=2)
    assert limits.effective_min_file_bytes == 16
    assert limits.effective_max_test_files == 2


def test_security_code_is_ranked_because_security_is_scored() -> None:
    """The evaluator grades security, so it has to be shown the code that implements it.

    Access control and rate limiting previously scored at the floor, below
    ordinary infrastructure, and were never analyzed - so the model graded a
    repository's security having seen none of it.
    """

    assert relevance_score("api/app/project_access.py") > relevance_score("api/app/db.py")
    assert relevance_score("src/auth/session.py") > relevance_score("src/util/dates.py")
    # Still gated on a source suffix: a directory name alone proves nothing.
    assert relevance_score("api/auth/notes.txt") < relevance_score("api/auth/session.py")
