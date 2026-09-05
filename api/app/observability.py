"""Request-scoped correlation ids.

Every incoming request gets an id (reusing the caller's `x-request-id` when
present, so a trace survives across services). The id is put in a ContextVar
that a logging filter reads, which means every log line emitted while handling
that request carries it without any call site having to pass it around.
"""

from __future__ import annotations

import logging
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

REQUEST_ID_HEADER = "x-request-id"

_request_id: ContextVar[str] = ContextVar("request_id", default="-")


def get_request_id() -> str:
    """Current request's id, or '-' outside a request."""
    return _request_id.get()


class RequestIdFilter(logging.Filter):
    """Injects `request_id` into every record so the format string can use it."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id.get()
        return True


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Assigns the id and echoes it back so clients can quote it in bug reports."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[no-untyped-def]
        incoming = request.headers.get(REQUEST_ID_HEADER, "").strip()
        request_id = incoming[:64] if incoming else uuid.uuid4().hex[:16]
        token = _request_id.set(request_id)
        try:
            response = await call_next(request)
        finally:
            _request_id.reset(token)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response


def configure_logging(level: int = logging.INFO) -> None:
    """Root logging with the request id in every line. Safe to call twice."""
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s [%(request_id)s] %(name)s %(message)s")
    )
    handler.addFilter(RequestIdFilter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
