# PROMPTWARS 2026 — Starter

> **PROBLEM STATEMENT**
> _<!-- Paste the problem statement here the moment it drops. -->_
> _TBD_

> **LIVE URLS**
> | What | URL |
> | --- | --- |
> | Web | `<!-- https://____.vercel.app -->` _TBD_ |
> | API | `<!-- https://____.vercel.app -->` _TBD_ |
> | API docs | `<!-- https://____.vercel.app/docs -->` _TBD_ |

Domain-free scaffolding. There are no product features here on purpose — the
only thing this repo does is prove that every layer is wired up, so tomorrow
you write feature code and nothing else.

---

## Architecture

```mermaid
flowchart TD
    subgraph Browser
        U["User"]
    end

    subgraph V1["Vercel project 1 — web"]
        N["Next.js 15 App Router<br/>TypeScript strict + Tailwind"]
        L["lib/api.ts<br/>typed fetch + error normalisation"]
        N --- L
    end

    subgraph V2["Vercel project 2 — api"]
        E["api/index.py<br/>Vercel Python entrypoint"]
        F["FastAPI (Python 3.12)<br/>CORS · /health · routers"]
        R["ratelimit.py · errors.py"]
        D["db.py<br/>async engine, NullPool"]
        E --> F --> R
        F --> D
    end

    P[("Postgres<br/>SQLAlchemy 2.0 async + asyncpg")]

    U -->|"HTTPS"| N
    L -->|"fetch NEXT_PUBLIC_API_URL<br/>CORS-checked"| E
    D -->|"asyncpg, TLS<br/>one connection per invocation"| P
```

**Why two Vercel projects.** Next.js and the Python runtime want different
build pipelines and different root directories. One project per runtime keeps
each build honest and lets you redeploy the API without rebuilding the web app.

**Why `NullPool`.** Serverless functions are created and destroyed constantly.
A connection pool per instance multiplies into hundreds of Postgres
connections and hits `max_connections` under load. `NullPool` opens a
connection per invocation and drops it. This is the single most important line
in `api/app/db.py`.

**Why the home page is a client component.** A server component would call the
API from Vercel's runtime and would never exercise CORS — which is precisely
the thing that breaks in production. The check runs in the browser so a green
result means the whole chain is genuinely correct.

---

## Layout

```
api/    FastAPI service   → Vercel project 2 (root directory: api)
web/    Next.js frontend  → Vercel project 1 (root directory: web)
```

Each has its own `.gitignore` and `.env.example`. They are deployed
independently and share nothing but the HTTP contract.

---

## Setup

Requires Node 20+, Python 3.12, and a Postgres you can reach.

### 1. API

```bash
cd api
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then edit DATABASE_URL
python scripts/seed.py        # creates tables + sample rows, idempotent
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs for the generated OpenAPI UI.

### 2. Web

```bash
cd web
npm install
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

Open http://localhost:3000. A green **"API and database reachable"** card means
Next → CORS → FastAPI → Postgres all work.

---

## Environment variables

### `api/.env`

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres URL — paste the provider's string **verbatim**. `postgres://` / `postgresql://` are rewritten to `postgresql+asyncpg://`; libpq-only params (`sslmode`, `channel_binding`, `pgbouncer`) are stripped and translated into asyncpg's `ssl=True`; pooled endpoints are detected and made PgBouncer-safe. See the table below. |
| `ALLOWED_ORIGINS` | yes in prod | Comma-separated origins for CORS. Exact scheme, no trailing slash. Add your production **and** preview web domains. |
| `GOOGLE_API_KEY` | no | Server-side only. Never mirror into a `NEXT_PUBLIC_*` var. |
| `ENV` | no | `development` \| `test` \| `preview` \| `production`. Outside dev/test, 500 responses are stripped to a generic message. |

### `web/.env.local`

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | yes | Origin of the deployed API, no trailing slash. |

### What `DATABASE_URL` actually looks like

| Where | Value |
| --- | --- |
| **Local** (Homebrew Postgres, trust auth) | `postgresql://<your-mac-username>@localhost:5432/promptwars_dev` |
| **Local** (password auth) | `postgresql://postgres:postgres@localhost:5432/app` |
| **Neon / Vercel Postgres** | `postgresql://user:pass@ep-xxx-pooler.<region>.aws.neon.tech/neondb?sslmode=require` |
| **Supabase** | `postgresql://postgres.<ref>:pass@aws-0-<region>.pooler.supabase.com:6543/postgres` |

**Always use the pooled endpoint in production** — the hostname containing
`-pooler`, or port `6543`. Serverless opens a fresh connection per invocation
(`NullPool`), and the pooler is the only thing keeping you under
`max_connections`.

`app/db.py` detects a pooled endpoint and disables asyncpg's prepared-statement
cache while giving each statement a UUID name. Without that, PgBouncer's
transaction mode shares server connections between clients and you get
`prepared statement "__asyncpg_stmt_1__" already exists` or
`InvalidCachedStatementError` under concurrency — a failure that only appears
once two requests overlap, which is to say, during the demo.

> **`NEXT_PUBLIC_*` is compiled into the JavaScript the browser downloads.**
> Anything you put there is public forever. Secrets belong in the API project's
> env vars only, where the browser never sees them.

---

## Tests

```bash
cd api && source .venv/bin/activate && pytest
```

15 tests, no infrastructure required — they run against in-memory SQLite via
`aiosqlite`, so `pytest` works on a plane. Both happy and failure paths are
covered: DB up/down, 404, 422, unknown fields, bad path params, out-of-range
pagination, rate-limit trip, and CORS preflight.

```bash
cd web && npx tsc --noEmit    # strict type check, zero `any`
cd web && npm run build       # production build
```

---

## The patterns to copy

| I want to… | Copy |
| --- | --- |
| Add an endpoint | `api/app/routers/example.py` → new file → register in `api/app/main.py` |
| Add a table | `api/app/models.py`, then re-run `python scripts/seed.py` |
| Call the API from the UI | `api.get<T>("/path")` from `web/lib/api.ts` |
| Build a screen | `web/app/page.tsx` + the kit in `web/components/ui` |
| Share a response shape | `api/app/schemas.py` (`ApiModel`, `Page[T]`) and mirror the type in `web/lib/api.ts` |

**Migrations.** `Base.metadata.create_all()` in `scripts/seed.py` is the whole
migration story. It creates missing tables and never drops anything. Reach for
Alembic only if you have to change a table that already holds data you care
about — which, in three hours, you will not.

---

## Conventions this repo enforces

- **No `any`.** `tsc --noEmit` is clean under `strict`.
- **Pydantic models on every route**, request and response. `extra="forbid"`
  means an unexpected key is a 422, not a silent drop.
- **One error shape.** The API only ever returns `{"error": "..."}`. Stack
  traces and validation internals are logged server-side, never shipped.
- **Contrast is verified, not vibes.** Every text token clears 4.5:1 on both
  `bg` and `surface` in light and dark; control borders and focus rings clear
  3:1. Focus rings are global and must never be removed.
- **Labels are structural.** `<Input>` has no unlabelled variant — the `label`
  prop is required and always linked via `htmlFor`.

---

## Known notes

- `npm audit` flags `postcss` advisories inside Next 15's bundled copy. They are
  build-time only, and the only upstream fix is Next 16. The repo's own direct
  `postcss` dependency is on a patched version. Left as-is to stay on Next 15.
- The rate limiter is in-memory, so on Vercel the effective limit is
  `limit × warm instances`. It is an abuse brake, not a quota. Swap in Upstash
  Redis if you need a real global limit; the dependency signature stays the same.
