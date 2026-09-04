"""Example CRUD router: happy path and failure path."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from starlette.requests import Request


# --- Happy path --------------------------------------------------------------


async def test_create_then_read_item(client: AsyncClient) -> None:
    created = await client.post("/example", json={"name": "widget", "description": "a thing"})
    assert created.status_code == 201

    body = created.json()
    assert body["name"] == "widget"
    assert body["description"] == "a thing"
    assert isinstance(body["id"], int)
    assert body["created_at"] and body["updated_at"]

    fetched = await client.get(f"/example/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == body["id"]


async def test_list_items_paginates(client: AsyncClient) -> None:
    for index in range(5):
        response = await client.post("/example", json={"name": f"item-{index}"})
        assert response.status_code == 201

    page = await client.get("/example", params={"limit": 2, "offset": 1})
    assert page.status_code == 200

    body = page.json()
    assert body["meta"] == {"total": 5, "limit": 2, "offset": 1}
    assert len(body["items"]) == 2
    # Newest first, so offset 1 skips item-4.
    assert [item["name"] for item in body["items"]] == ["item-3", "item-2"]


async def test_list_items_filters_by_query(client: AsyncClient) -> None:
    await client.post("/example", json={"name": "alpha"})
    await client.post("/example", json={"name": "beta"})

    page = await client.get("/example", params={"q": "alph"})

    assert page.status_code == 200
    assert page.json()["meta"]["total"] == 1
    assert page.json()["items"][0]["name"] == "alpha"


async def test_update_and_delete_item(client: AsyncClient) -> None:
    item_id = (await client.post("/example", json={"name": "before"})).json()["id"]

    patched = await client.patch(f"/example/{item_id}", json={"name": "after"})
    assert patched.status_code == 200
    assert patched.json()["name"] == "after"

    deleted = await client.delete(f"/example/{item_id}")
    assert deleted.status_code == 204

    assert (await client.get(f"/example/{item_id}")).status_code == 404


async def test_empty_list_is_not_an_error(client: AsyncClient) -> None:
    page = await client.get("/example")

    assert page.status_code == 200
    assert page.json() == {"items": [], "meta": {"total": 0, "limit": 20, "offset": 0}}


# --- Failure path ------------------------------------------------------------


async def test_missing_item_returns_generic_error_shape(client: AsyncClient) -> None:
    response = await client.get("/example/999999")

    assert response.status_code == 404
    assert response.json() == {"error": "Item not found"}


async def test_invalid_body_returns_422_without_leaking_internals(client: AsyncClient) -> None:
    response = await client.post("/example", json={"description": "no name"})

    assert response.status_code == 422
    assert response.json() == {"error": "Invalid request"}


async def test_unknown_field_is_rejected(client: AsyncClient) -> None:
    response = await client.post("/example", json={"name": "ok", "is_admin": True})

    assert response.status_code == 422
    assert response.json() == {"error": "Invalid request"}


async def test_bad_path_param_is_rejected(client: AsyncClient) -> None:
    response = await client.get("/example/not-a-number")

    assert response.status_code == 422
    assert response.json() == {"error": "Invalid request"}


async def test_limit_above_maximum_is_rejected(client: AsyncClient) -> None:
    response = await client.get("/example", params={"limit": 1000})

    assert response.status_code == 422
    assert response.json() == {"error": "Invalid request"}


async def test_rate_limiter_trips_after_the_limit() -> None:
    from fastapi import HTTPException

    from app.ratelimit import RateLimiter, reset_rate_limit

    reset_rate_limit()
    limiter = RateLimiter(limit=2, window_seconds=60.0)
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/example",
            "headers": [(b"x-forwarded-for", b"9.9.9.9")],
            "client": ("10.0.0.1", 1234),
        }
    )

    await limiter(request)
    await limiter(request)

    with pytest.raises(HTTPException) as caught:
        await limiter(request)

    assert caught.value.status_code == 429
    assert caught.value.headers is not None
    assert "Retry-After" in caught.value.headers


async def test_rate_limiter_isolates_ips() -> None:
    from app.ratelimit import RateLimiter, reset_rate_limit

    reset_rate_limit()
    limiter = RateLimiter(limit=1, window_seconds=60.0)

    def _request(ip: str) -> Request:
        return Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/example",
                "headers": [(b"x-forwarded-for", ip.encode())],
                "client": ("10.0.0.1", 1234),
            }
        )

    await limiter(_request("1.1.1.1"))
    await limiter(_request("2.2.2.2"))  # different IP, own budget
