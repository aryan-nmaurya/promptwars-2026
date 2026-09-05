"""Exception handlers.

Contract: the client always gets `{"error": "..."}`. The detail - stack
trace, SQL, validation internals - is logged server-side and never shipped.
Author-written `HTTPException` messages are considered safe and pass through.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings

logger = logging.getLogger(__name__)

GENERIC_MESSAGE = "Internal server error"


def _error(
    status_code: int, message: str, *, headers: dict[str, str] | None = None
) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": message}, headers=headers)


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Author-written 4xx detail is safe to return; 5xx detail is logged and hidden."""
    # These are deliberate ("Item not found"), so the message is safe to return.
    message = exc.detail if isinstance(exc.detail, str) else "Request failed"
    if exc.status_code >= 500:
        logger.error("HTTP %s on %s: %s", exc.status_code, request.url.path, exc.detail)
        message = GENERIC_MESSAGE
    else:
        logger.info("HTTP %s on %s: %s", exc.status_code, request.url.path, exc.detail)
    return _error(exc.status_code, message, headers=exc.headers)


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    # Full field-level errors go to the log; the client gets a one-liner so we
    # do not leak internal field names or the shape of the model.
    logger.info("Validation failed on %s: %s", request.url.path, exc.errors())
    return _error(422, "Invalid request")  # literal: Starlette renamed the constant


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Last resort: log the traceback, return a generic body outside dev and test."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    message = f"{type(exc).__name__}: {exc}" if get_settings().debug_errors else GENERIC_MESSAGE
    return _error(500, message)


def register_error_handlers(app: FastAPI) -> None:
    """Install the handlers that guarantee every error is shaped {"error": "..."}."""
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)
