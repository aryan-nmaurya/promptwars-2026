"""FastAPI application factory and entrypoint.

Imported by `api/index.py` (Vercel) and by `uvicorn app.main:app` (local).
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import db
from app.config import get_settings
from app.errors import register_error_handlers
from app.schemas import ErrorResponse, HealthResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


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

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        max_age=600,
    )

    register_error_handlers(app)

    @app.get("/health", response_model=HealthResponse, tags=["meta"], summary="Liveness + DB check")
    async def health() -> HealthResponse:
        # Always 200. `db` tells you whether Postgres answered; a red DB should
        # not make the platform think the whole function is dead.
        return HealthResponse(status="ok", db=await db.ping_db())

    logger.info("App started env=%s origins=%s", settings.ENV, settings.allowed_origins)
    return app


app = create_app()
