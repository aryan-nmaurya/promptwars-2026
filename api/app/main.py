"""FastAPI application factory and entrypoint.

Imported by `api/index.py` (Vercel) and by `uvicorn app.main:app` (local).
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import db
from app.cache import TTLCache
from app.config import get_settings
from app.deps import gemini_or_none
from app.errors import register_error_handlers
from app.observability import RequestIdMiddleware, configure_logging
from app.routers import auth, evaluations, ideas, mentor, projects
from app.schemas import ErrorResponse, HealthResponse
from app.security_headers import SecurityHeadersMiddleware

configure_logging(logging.INFO)
logger = logging.getLogger(__name__)


#: Platform health checks poll far more often than Gemini's reachability
#: changes, and an uncached probe spends a real API call on every hit. Thirty
#: seconds keeps /health honest without billing it.
GEMINI_PROBE_TTL_SECONDS = 30.0
_gemini_probe: TTLCache[bool] = TTLCache(ttl_seconds=GEMINI_PROBE_TTL_SECONDS)
_GEMINI_PROBE_KEY = "gemini"


async def _probe_gemini() -> bool:
    """Gemini reachability, at most once per `GEMINI_PROBE_TTL_SECONDS`."""
    service = gemini_or_none()
    if service is None:
        return False
    cached = _gemini_probe.get(_GEMINI_PROBE_KEY)
    if cached is not None:
        return cached
    reachable = await service.ping()
    _gemini_probe.set(_GEMINI_PROBE_KEY, reachable)
    return reachable


def reset_health_cache() -> None:
    """Clear the cached Gemini probe. Used by tests."""
    _gemini_probe.clear()


def create_app() -> FastAPI:
    """Build the app. Middleware order matters - see the comments inline."""
    settings = get_settings()

    app = FastAPI(
        title="IdeaForge API",
        version="0.2.0",
        description=(
            "Generate, scope, plan, mentor, and evaluate final-year projects "
            "against bounded evidence from public GitHub repositories."
        ),
        docs_url="/docs",
        openapi_url="/openapi.json",
        responses={500: {"model": ErrorResponse}},
    )

    # Outermost so the id is set before anything else logs, and so the
    # response header survives every other layer.
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        max_age=600,
    )

    register_error_handlers(app)
    app.include_router(auth.router)
    app.include_router(ideas.router)
    app.include_router(projects.router)
    app.include_router(mentor.router)
    app.include_router(evaluations.router)

    @app.get(
        "/health",
        response_model=HealthResponse,
        tags=["meta"],
        summary="Liveness plus dependency checks",
    )
    async def health() -> HealthResponse:
        """Always 200.

        `db` and `gemini` report each dependency separately; a red dependency
        must not make the platform think the whole function is dead. The two
        probes run concurrently so /health stays fast, and the Gemini one is
        cached so polling this endpoint cannot spend the daily quota.
        """
        db_ok, gemini_ok = await asyncio.gather(db.ping_db(), _probe_gemini())
        return HealthResponse(status="ok", db=db_ok, gemini=gemini_ok)

    logger.info("App started env=%s origins=%s", settings.ENV, settings.allowed_origins)
    return app


app = create_app()
