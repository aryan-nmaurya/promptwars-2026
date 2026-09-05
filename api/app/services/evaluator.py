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
from app.services.github import RepositoryEvidence

EVALUATOR_VERSION = "2026-09-05.1"


class EvaluatedResult(BaseModel):
    """Validated JSON persisted with an immutable Evaluation row."""

    repository: RepositorySnapshot
    overall_score: int
    scores: EvaluationScores
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


def _observable_caps(
    evidence: RepositoryEvidence, testing: int, documentation: int, security: int
) -> tuple[int, int, int]:
    paths = [item.path.lower() for item in evidence.files]
    has_tests = any(_is_test_path(path) for path in paths)
    has_docs = any(PurePosixPath(path).name.startswith("readme") for path in paths)
    has_redaction = any("[REDACTED" in item.content for item in evidence.files)
    return (
        testing if has_tests else min(testing, 20),
        documentation if has_docs else min(documentation, 20),
        min(security, 40) if has_redaction else security,
    )


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

    feature_completion = _feature_score(items)
    testing, documentation, security = _observable_caps(
        evidence,
        generated.scores.testing,
        generated.scores.documentation,
        generated.scores.security,
    )
    scores = EvaluationScores(
        feature_completion=feature_completion,
        architecture=generated.scores.architecture,
        code_quality=generated.scores.code_quality,
        testing=testing,
        documentation=documentation,
        security=security,
    )
    overall = round(
        scores.feature_completion * 0.40
        + scores.architecture * 0.15
        + scores.code_quality * 0.15
        + scores.testing * 0.10
        + scores.documentation * 0.10
        + scores.security * 0.10
    )
    limitations = list(
        dict.fromkeys(
            [
                *evidence.limitations,
                "Only selected text files were analyzed; runtime behavior was not verified.",
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
