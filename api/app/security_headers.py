"""Security response headers for the API.

The API serves JSON and an OpenAPI docs page, so its CSP can be far stricter
than the web app's - except on /docs, which loads Swagger UI from a CDN.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

_DOCS_PATHS = ("/docs", "/redoc", "/docs/oauth2-redirect")

API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"

DOCS_CSP = (
    "default-src 'none'; "
    "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; base-uri 'none'"
)

STATIC_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "Cross-Origin-Resource-Policy": "cross-origin",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds CSP and hardening headers to every API response."""

    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[no-untyped-def]
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = (
            DOCS_CSP if request.url.path in _DOCS_PATHS else API_CSP
        )
        for header, value in STATIC_HEADERS.items():
            response.headers.setdefault(header, value)
        return response
