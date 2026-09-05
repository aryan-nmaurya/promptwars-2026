"""FastAPI application factory and entrypoint.

Imported by `api/index.py` (Vercel) and by `uvicorn app.main:app` (local).
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import db
from app.config import get_settings
from app.deps import gemini_or_none
from app.errors import register_error_handlers
from app.observability import RequestIdMiddleware, configure_logging
from app.security_headers import SecurityHeadersMiddleware
from app.routers import ideas, mentor, projects
from app.schemas import ErrorResponse, HealthResponse

configure_logging(logging.INFO)
logger = logging.getLogger(__name__)


async def _false() -> bool:
    """Stand-in probe for when no Gemini key is configured."""
    return False


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="API",
        version="0.1.0",
        description="Hackathon starter API.",
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
    app.include_router(ideas.router)
    app.include_router(projects.router)
    app.include_router(mentor.router)

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
        probes run concurrently so /health stays fast.
        """
        service = gemini_or_none()
        db_ok, gemini_ok = await asyncio.gather(
            db.ping_db(),
            service.ping() if service is not None else _false(),
        )
        return HealthResponse(status="ok", db=db_ok, gemini=gemini_ok)

    logger.info("App started env=%s origins=%s", settings.ENV, settings.allowed_origins)
    return app


app = create_app()
