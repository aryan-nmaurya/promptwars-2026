"""Health endpoint: database reachable, and database down."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app import db
from app.main import app as fastapi_app


async def test_health_reports_db_true_when_database_is_reachable(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": True}


async def test_health_still_200_with_db_false_when_database_is_down(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _DeadSession:
        async def __aenter__(self) -> None:
            raise OSError("connection refused")

        async def __aexit__(self, *_: object) -> bool:
            return False

    monkeypatch.setattr(db, "SessionLocal", lambda: _DeadSession())

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    # The platform must still see a live function - only `db` flips.
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": False}


async def test_cors_preflight_allows_configured_origin(client: AsyncClient) -> None:
    response = await client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
