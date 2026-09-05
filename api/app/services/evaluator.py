"""Evidence-backed comparison of a frozen project plan and a GitHub commit."""

from __future__ import annotations

from pathlib import PurePosixPath

from pydantic import BaseModel

from app.models import Project
from app.schemas import (
    EvaluationCoverage,
    EvaluationFix,
    EvaluationScores,
    EvidenceReference,
    PlannedVsBuiltItem,
    RepositorySnapshot,
)
from app.services.gemini import GeminiService, GeneratedPlannedItem
from app.services.github import RepositoryEvidence, is_security_relevant_path

EVALUATOR_VERSION = "2026-09-05.1"


class EvaluatedResult(BaseModel):
    """Validated JSON persisted with an immutable Evaluation row."""

    repository: RepositorySnapshot
    overall_score: int
    scores: EvaluationScores
    unassessed_categories: list[str]
    planned_vs_built: list[PlannedVsBuiltItem]
    top_fixes: list[EvaluationFix]
    coverage: EvaluationCoverage
    limitations: list[str]


def frozen_plan(project: Project) -> list[str]:
    """Return the explicit scope, with a safe path for older persisted projects."""

    features = [str(item).strip()[:300] for item in (project.core_features or [])]
    features = [item for item in features if item]
    if features:
        return features[:12]
    roadmap = [step.title.strip()[:300] for step in project.steps if step.title.strip()]
    return roadmap[:6] or [project.summary.strip()[:300] or project.title.strip()[:300]]


def _render_plan(project: Project, features: list[str]) -> str:
    numbered = "\n".join(f"{index}. {feature}" for index, feature in enumerate(features, 1))
    return (
        f"Project: {project.title}\n"
        f"Problem: {project.problem_solved}\n"
        f"Summary: {project.summary}\n"
        f"Technology: {', '.join(project.tech_stack)}\n"
        f"Core features:\n{numbered}"
    )


def _render_evidence(evidence: RepositoryEvidence) -> str:
    if not evidence.files:
        return "No eligible text file content was available."
    sections = []
    for item in evidence.files:
        sections.append(f"FILE: {item.path}\nBLOB: {item.sha}\n---\n{item.content}\n--- END FILE")
    return "\n\n".join(sections)


def deterministic_summary(evidence: RepositoryEvidence) -> str:
    """Describe observable repository signals without inferring runtime behavior."""

    paths = [item.path.lower() for item in evidence.files]
    names = [PurePosixPath(path).name for path in paths]
    tests = [
        path
        for path in paths
        if "test" in PurePosixPath(path).parts
        or PurePosixPath(path).name.startswith(("test_", "spec."))
        or ".test." in path
        or ".spec." in path
    ]
    manifests = [
        path
        for path, name in zip(paths, names, strict=True)
        if name
        in {
            "package.json",
            "pyproject.toml",
            "requirements.txt",
            "go.mod",
            "cargo.toml",
            "pom.xml",
            "build.gradle",
        }
    ]
    readmes = [path for path, name in zip(paths, names, strict=True) if name.startswith("readme")]
    automation = [path for path in paths if path.startswith(".github/")]
    deployment = [
        path
        for path, name in zip(paths, names, strict=True)
        if name
        in {
            "dockerfile",
            "docker-compose.yml",
            "vercel.json",
            "fly.toml",
            "render.yaml",
            "netlify.toml",
        }
    ]
    redactions = sum(item.content.count("[REDACTED") for item in evidence.files)
    return "\n".join(
        [
            f"Pinned commit: {evidence.commit_sha}",
            f"Tree complete: {evidence.tree_complete}",
            f"Eligible files considered: {evidence.files_considered}",
            f"Files analyzed: {evidence.files_analyzed}",
            f"Bytes analyzed: {evidence.bytes_analyzed}",
            f"Test-like files supplied: {', '.join(tests) or 'none'}",
            f"Manifests supplied: {', '.join(manifests) or 'none'}",
            f"README files supplied: {', '.join(readmes) or 'none'}",
            f"CI files supplied: {', '.join(automation) or 'none'}",
            f"Deployment files supplied: {', '.join(deployment) or 'none'}",
            f"Secret-like values redacted before analysis: {redactions}",
        ]
    )


def _safe_planned_item(
    feature: str,
    generated: GeneratedPlannedItem | None,
    allowed_paths: set[str],
) -> PlannedVsBuiltItem:
    if generated is None:
        return PlannedVsBuiltItem(
            planned_item=feature,
            status="insufficient_evidence",
            confidence=0,
            gap="The evaluator returned no result for this planned feature.",
        )

    references = [
        EvidenceReference(path=item.path, reason=item.reason)
        for item in generated.evidence
        if item.path in allowed_paths
    ]
    status = generated.status
    gap = generated.gap
    confidence = generated.confidence
    implementation_evidence = any(_is_implementation_path(item.path) for item in references)
    if status in {"implemented", "partial"} and not implementation_evidence:
        status = "insufficient_evidence"
        gap = "No supplied implementation file supports this positive claim."
        confidence = 0
    if status != "implemented" and not gap:
        gap = "The supplied static evidence does not demonstrate the complete feature."
    return PlannedVsBuiltItem(
        planned_item=feature,
        status=status,
        confidence=confidence,
        evidence=references,
        gap=gap,
    )


def _is_test_path(path: str) -> bool:
    pure = PurePosixPath(path.lower())
    return (
        bool(set(pure.parts) & {"test", "tests", "__tests__"})
        or pure.name.startswith(("test_", "spec."))
        or ".test." in pure.name
        or ".spec." in pure.name
    )


def _is_implementation_path(path: str) -> bool:
    pure = PurePosixPath(path.lower())
    if _is_test_path(path) or pure.suffix in {".md", ".txt", ".rst"}:
        return False
    return pure.name not in {
        "package.json",
        "pyproject.toml",
        "requirements.txt",
        "go.mod",
        "cargo.toml",
        "pom.xml",
        "build.gradle",
    }


def _feature_score(items: list[PlannedVsBuiltItem]) -> int:
    values = {"implemented": 1.0, "partial": 0.5, "not_found": 0.0, "insufficient_evidence": 0.0}
    return round(100 * sum(values[item.status] for item in items) / len(items))


#: Weight of each category in the overall score. Weights are renormalised over
#: whichever categories the evidence could actually support, so a repository is
#: never penalised for a category this analyzer could not see.
CATEGORY_WEIGHTS: dict[str, float] = {
    "feature_completion": 0.40,
    "architecture": 0.15,
    "code_quality": 0.15,
    "testing": 0.10,
    "documentation": 0.10,
    "security": 0.10,
}


def assessable_categories(evidence: RepositoryEvidence) -> dict[str, bool]:
    """Return which categories the analyzed files can actually support.

    Scoring a category from evidence that says nothing about it is a guess
    wearing a measurement's clothes. `feature_completion` is always assessable
    because it is computed from the frozen plan, not from the repository.
    """

    paths = [item.path for item in evidence.files]
    has_implementation = any(_is_implementation_path(path) for path in paths)
    return {
        "feature_completion": True,
        "architecture": has_implementation,
        "code_quality": has_implementation,
        "testing": any(_is_test_path(path) for path in paths),
        "documentation": any(
            PurePosixPath(path.lower()).name.startswith("readme") for path in paths
        ),
        # Either a control was analyzed, or this collector actually replaced a
        # credential in the source. The second is a fact recorded during
        # redaction, not a search for the marker in the finished text: a file
        # that merely mentions the marker - as any security tool's own source
        # does - is not evidence of anything.
        "security": any(is_security_relevant_path(path) for path in paths)
        or any(item.redactions > 0 for item in evidence.files),
    }


async def evaluate_project_repository(
    *, project: Project, evidence: RepositoryEvidence, gemini: GeminiService
) -> EvaluatedResult:
    """Generate claims, validate every citation, and compute a stable weighted score."""

    features = frozen_plan(project)
    summary = deterministic_summary(evidence)
    generated = await gemini.evaluate_repository(
        plan=_render_plan(project, features),
        repository_evidence=_render_evidence(evidence),
        deterministic_summary=summary,
    )
    allowed_paths = {item.path for item in evidence.files}
    items = [
        _safe_planned_item(
            feature,
            generated.planned_vs_built[index] if index < len(generated.planned_vs_built) else None,
            allowed_paths,
        )
        for index, feature in enumerate(features)
    ]

    assessable = assessable_categories(evidence)
    proposed = {
        "feature_completion": _feature_score(items),
        "architecture": generated.scores.architecture,
        "code_quality": generated.scores.code_quality,
        "testing": generated.scores.testing,
        "documentation": generated.scores.documentation,
        "security": generated.scores.security,
    }
    measured = {name: value for name, value in proposed.items() if assessable[name]}
    unassessed = [name for name in CATEGORY_WEIGHTS if not assessable[name]]
    scores = EvaluationScores(**{name: measured.get(name) for name in proposed})

    # Renormalise over what was measured. Without this a repository with no
    # tests would lose a tenth of its total to a category nobody scored, which
    # is a penalty disguised as an average.
    weight_total = sum(CATEGORY_WEIGHTS[name] for name in measured)
    overall = round(
        sum(CATEGORY_WEIGHTS[name] * value for name, value in measured.items()) / weight_total
    )
    unassessed_note = (
        [
            "Not scored, because the analyzed files contained no evidence for it: "
            + ", ".join(name.replace("_", " ") for name in unassessed)
            + "."
        ]
        if unassessed
        else []
    )
    limitations = list(
        dict.fromkeys(
            [
                *evidence.limitations,
                "Only selected text files were analyzed; runtime behavior was not verified.",
                *unassessed_note,
            ]
        )
    )[:10]

    return EvaluatedResult(
        repository=RepositorySnapshot(
            url=evidence.repository.canonical_url,
            full_name=evidence.repository.full_name,
            commit_sha=evidence.commit_sha,
            default_branch=evidence.default_branch,
        ),
        overall_score=overall,
        scores=scores,
        unassessed_categories=unassessed,
        planned_vs_built=items,
        top_fixes=[EvaluationFix.model_validate(item) for item in generated.top_fixes[:3]],
        coverage=EvaluationCoverage(
            tree_complete=evidence.tree_complete,
            files_considered=evidence.files_considered,
            files_analyzed=evidence.files_analyzed,
            bytes_analyzed=evidence.bytes_analyzed,
        ),
        limitations=limitations,
    )
