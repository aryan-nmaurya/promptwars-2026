"""The CRUD pattern to copy.

Everything a feature router needs is here and nowhere else: Pydantic models on
every route, a session from the dependency, limit/offset pagination, and 404s
raised as `HTTPException` so `errors.py` shapes the response.

To add a feature: copy this file, rename `Item` -> your model, register it in
`app/main.py`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Item
from app.ratelimit import default_rate_limit
from app.schemas import ApiModel, ErrorResponse, Page, PageMeta

router = APIRouter(
    prefix="/example",
    tags=["example"],
    dependencies=[default_rate_limit],
    responses={
        422: {"model": ErrorResponse, "description": "Invalid request"},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
    },
)

SessionDep = Annotated[AsyncSession, Depends(get_session)]
ItemId = Annotated[int, Path(ge=1, description="Item id")]


# --- Schemas -----------------------------------------------------------------


class ItemCreate(ApiModel):
    name: str
    description: str | None = None


class ItemUpdate(ApiModel):
    name: str | None = None
    description: str | None = None


class ItemRead(ApiModel):
    id: int
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


# --- Helpers -----------------------------------------------------------------


async def _get_or_404(session: AsyncSession, item_id: int) -> Item:
    item = await session.get(Item, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return item


# --- Routes ------------------------------------------------------------------


@router.get("", response_model=Page[ItemRead], summary="List items")
async def list_items(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    q: Annotated[str | None, Query(max_length=200, description="Case-insensitive name filter")] = None,
) -> Page[ItemRead]:
    where = []
    if q:
        where.append(Item.name.ilike(f"%{q}%"))

    total = await session.scalar(select(func.count()).select_from(Item).where(*where)) or 0
    rows = await session.scalars(
        select(Item).where(*where).order_by(Item.id.desc()).limit(limit).offset(offset)
    )
    return Page[ItemRead](
        items=[ItemRead.model_validate(row) for row in rows],
        meta=PageMeta(total=total, limit=limit, offset=offset),
    )


@router.get(
    "/{item_id}",
    response_model=ItemRead,
    summary="Get one item",
    responses={404: {"model": ErrorResponse, "description": "Item not found"}},
)
async def get_item(session: SessionDep, item_id: ItemId) -> ItemRead:
    return ItemRead.model_validate(await _get_or_404(session, item_id))


@router.post(
    "", response_model=ItemRead, status_code=status.HTTP_201_CREATED, summary="Create an item"
)
async def create_item(session: SessionDep, payload: ItemCreate) -> ItemRead:
    item = Item(name=payload.name, description=payload.description)
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return ItemRead.model_validate(item)


@router.patch(
    "/{item_id}",
    response_model=ItemRead,
    summary="Update an item",
    responses={404: {"model": ErrorResponse, "description": "Item not found"}},
)
async def update_item(session: SessionDep, item_id: ItemId, payload: ItemUpdate) -> ItemRead:
    item = await _get_or_404(session, item_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await session.commit()
    await session.refresh(item)
    return ItemRead.model_validate(item)


@router.delete(
    "/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an item",
    responses={404: {"model": ErrorResponse, "description": "Item not found"}},
)
async def delete_item(session: SessionDep, item_id: ItemId) -> None:
    item = await _get_or_404(session, item_id)
    await session.delete(item)
    await session.commit()
