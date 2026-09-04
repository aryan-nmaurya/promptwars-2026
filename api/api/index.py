"""Vercel Python runtime entrypoint.

Vercel looks for a module-level ASGI app called `app` in this file.
`vercel.json` rewrites every incoming path here.
"""

from app.main import app

__all__ = ["app"]
