"""Static public-GitHub evaluation for the owner of a project."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Path, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.deps import GeminiDep, SessionDep
from app.models import Evaluation
from app.project_access import verify_project_edit_token
from app.ratelimit import RateLimiter
from app.routers.projects import _evaluation_to_read, _load_project
from app.schemas import ErrorResponse, EvaluationRead, RepositoryEvaluate
from app.services.evaluator import (
    EVALUATOR_VERSION,
    evaluate_project_repository,
    frozen_plan,
)
from app.services.gemini import GeminiError
from app.services.github import (
    GitHubError,
    GitHubEvidenceCollector,
    GitHubNotFound,
    GitHubProtocolError,
    GitHubRateLimited,
    GitHubRepositoryMoved,
    GitHubRepositoryRejected,
    GitHubTimeout,
    InvalidGitHubURL,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/projects/{project_id}/evaluate",
    tags=["evaluation"],
    responses={
        403: {"model": ErrorResponse, "description": "Read-only shared project"},
        404: {"model": ErrorResponse, "description": "Not found"},
        422: {"model": ErrorResponse, "description": "Invalid repository"},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
    },
)

ProjectId = Annotated[str, Path(min_length=8, max_length=32)]
evaluation_limit = Depends(
    RateLimiter(limit=3, window_seconds=600.0, ip_limit=15, scope="evaluation")
)


def _existing_query(project_id: str, full_name: str, commit_sha: str):  # type: ignore[no-untyped-def]
    return select(Evaluation).where(
        Evaluation.project_id == project_id,
        Evaluation.repository_full_name == full_name,
        Evaluation.commit_sha == commit_sha,
        Evaluation.evaluator_version == EVALUATOR_VERSION,
    )


@router.post(
    "",
    response_model=EvaluationRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[evaluation_limit],
    summary="Compare the frozen plan with a public GitHub repository",
)
async def evaluate_repository(
    payload: RepositoryEvaluate,
    session: SessionDep,
    gemini: GeminiDep,
    project_id: ProjectId,
    edit_token: Annotated[str | None, Header(alias="x-project-edit-token")] = None,
) -> EvaluationRead:
    """Inspect bounded text evidence; repository code is never cloned or executed."""

    project = await _load_project(session, project_id)
    verify_project_edit_token(project, edit_token)
    settings = get_settings()
    try:
        async with GitHubEvidenceCollector(token=settings.GITHUB_TOKEN) as collector:
            evidence = await collector.collect(
                payload.github_url, planned_keywords=frozen_plan(project)
            )
    except InvalidGitHubURL as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except GitHubNotFound as exc:
        raise HTTPException(status_code=404, detail="Public GitHub repository not found") from exc
    except GitHubRateLimited as exc:
        headers = {"Retry-After": exc.retry_after} if exc.retry_after else None
        if not exc.authenticated:
            # Without GITHUB_TOKEN the whole instance shares 60 requests an
            # hour, which one collection can nearly exhaust on its own. That is
            # an operator problem, so say so in the logs instead of leaving the
            # student to retry against a limit that will not recover for them.
            logger.warning(
                "GitHub rate limit reached without a server token; set GITHUB_TOKEN "
                "to raise the allowance from 60 to 5000 requests per hour"
            )
        raise HTTPException(
            status_code=429, detail="GitHub rate limit reached; try again later", headers=headers
        ) from exc
    except GitHubRepositoryMoved as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except GitHubRepositoryRejected as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except GitHubTimeout as exc:
        raise HTTPException(status_code=504, detail="GitHub collection timed out") from exc
    except (GitHubProtocolError, GitHubError) as exc:
        logger.exception("GitHub evidence collection failed")
        raise HTTPException(status_code=502, detail="GitHub evidence collection failed") from exc

    existing = await session.scalar(
        _existing_query(project.id, evidence.repository.full_name, evidence.commit_sha)
    )
    if existing is not None:
        return _evaluation_to_read(existing)

    try:
        result = await evaluate_project_repository(
            project=project, evidence=evidence, gemini=gemini
        )
    except GeminiError as exc:
        logger.exception("Repository evaluation model call failed")
        raise HTTPException(status_code=503, detail="Repository evaluator unavailable") from exc

    row = Evaluation(
        project_id=project.id,
        repository_url=evidence.repository.canonical_url,
        repository_full_name=evidence.repository.full_name,
        commit_sha=evidence.commit_sha,
        evaluator_version=EVALUATOR_VERSION,
        overall_score=result.overall_score,
        result=result.model_dump(mode="json"),
    )
    session.add(row)
    try:
        await session.commit()
    except IntegrityError:
        # Concurrent requests for the same immutable commit converge on one row.
        await session.rollback()
        existing = await session.scalar(
            _existing_query(project.id, evidence.repository.full_name, evidence.commit_sha)
        )
        if existing is None:
            raise
        return _evaluation_to_read(existing)
    return _evaluation_to_read(row)
