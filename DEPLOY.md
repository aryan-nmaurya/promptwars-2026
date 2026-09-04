# Deploying

> **Already done.** Both projects exist, are connected to
> `aryan-nmaurya/promptwars-2026`, have their root directories and env vars set,
> and are deployed and public:
> `promptwars-api.vercel.app` · `promptwars-web.vercel.app`.
> The only outstanding step is creating the Postgres database — see
> **Finish the deployment** in `README.md`. Keep the rest of this file as the
> reference for rebuilding from scratch.

Two Vercel projects from **one** Git repository. Deploy the API first — the web
project needs its URL, and the API needs the web project's URL for CORS, so
there is one deliberate second pass at the end.

Push the repo to GitHub first. Both projects import the same repository and are
distinguished only by **Root Directory**.

---

## Project 1 — API (deploy this first)

**Vercel → Add New → Project → import the repo.**

| Setting | Value |
| --- | --- |
| Project Name | `promptwars-api` |
| Framework Preset | **Other** |
| Root Directory | `api` — click **Edit** next to Root Directory and pick the `api` folder |
| Build Command | *leave empty* (override OFF) |
| Output Directory | *leave empty* (override OFF) |
| Install Command | *leave empty* (override OFF) — Vercel installs `requirements.txt` itself |
| Node.js Version | irrelevant here |

The Python version comes from `api/.python-version`, which pins `3.12`.
Do not add a build command: the Python runtime builds `api/index.py` from
`vercel.json` and a build command will only get in its way.

### Environment variables

Add under **Settings → Environment Variables**. Tick **Production**,
**Preview**, and **Development** for each unless noted.

| Key | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://…` | Paste the **pooled** connection string verbatim — hostname with `-pooler`, or port `6543`. `sslmode`, `channel_binding` and `pgbouncer` params are handled in code, as is PgBouncer's prepared-statement problem. Using the *direct* (non-pooled) URL will exhaust `max_connections` under load. |
| `ALLOWED_ORIGINS` | `https://promptwars-web.vercel.app` | Fill in after Project 2 exists — see the second pass below. |
| `ENV` | `production` | Use `preview` on the Preview environment if you want richer errors there. |
| `GOOGLE_API_KEY` | *your key* | Optional. Production + Preview only. Never add this to the web project. |

If you use **Vercel Postgres / Neon**: open the **Storage** tab, create the
database, and connect it to this project — it injects `DATABASE_URL` and
`POSTGRES_URL` for you. Use the **pooled** URL.

Click **Deploy**. Then verify:

```bash
curl https://promptwars-api.vercel.app/health
```

Expect `{"status":"ok","db":true}`. If `db` is `false`, `DATABASE_URL` is wrong
or the database is unreachable — check the function logs under **Deployments →
… → Runtime Logs**.

### Create the tables

`create_all` does not run on deploy. Point your local machine at the production
database once:

```bash
cd api
source .venv/bin/activate
DATABASE_URL="<the production URL>" python scripts/seed.py
```

Idempotent — safe to re-run whenever you add a model.

---

## Project 2 — Web

**Vercel → Add New → Project → import the same repo again.**

| Setting | Value |
| --- | --- |
| Project Name | `promptwars-web` |
| Framework Preset | **Next.js** (auto-detected) |
| Root Directory | `web` — click **Edit** and pick the `web` folder |
| Build Command | *leave empty* (override OFF → runs `next build`) |
| Output Directory | *leave empty* (override OFF) |
| Install Command | *leave empty* (override OFF → runs `npm install`) |
| Node.js Version | **20.x** or newer |

### Environment variables

| Key | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://promptwars-api.vercel.app` | No trailing slash. Production + Preview + Development. |

That is the complete list. **Nothing else belongs in this project.** Every
variable here is compiled into the browser bundle, so a secret added to the web
project is a published secret.

Click **Deploy**.

---

## Second pass — close the CORS loop

The API cannot know the web URL until the web project exists, so finish here:

1. Copy the web project's production URL, e.g. `https://promptwars-web.vercel.app`.
2. Go to **promptwars-api → Settings → Environment Variables**.
3. Edit `ALLOWED_ORIGINS` to include it. To let preview deployments work too,
   add the ones you actually use, comma-separated and with no spaces:
   ```
   https://promptwars-web.vercel.app,https://promptwars-web-git-main-<team>.vercel.app,http://localhost:3000
   ```
4. Go to **promptwars-api → Deployments**, open the latest one, click the **⋯**
   menu → **Redeploy**. Environment variables are read at boot, so the change
   does not apply until you redeploy.
5. Open the web URL. The card must read **"API and database reachable"**.

---

## Deploy checklist

- [ ] API `/health` returns `{"status":"ok","db":true}`
- [ ] `python scripts/seed.py` has been run against the production database
- [ ] `ALLOWED_ORIGINS` on the API contains the exact web production origin
- [ ] API redeployed *after* `ALLOWED_ORIGINS` was set
- [ ] Web home page shows the green card
- [ ] No secret exists in any `NEXT_PUBLIC_*` variable
- [ ] LIVE URLS filled into `README.md`

---

## When it breaks

| Symptom | Cause | Fix |
| --- | --- | --- |
| Web shows "Could not reach the API" | Origin missing from `ALLOWED_ORIGINS`, or the API is down | Add the exact origin (scheme, no trailing slash), then **redeploy the API** |
| `/health` returns `db:false` | Bad `DATABASE_URL`, or the DB rejects TLS | Check Runtime Logs; use the **pooled** connection string |
| API 404s on every path | `vercel.json` not picked up | Root Directory must be `api`, so `api/vercel.json` is the project's config |
| `ModuleNotFoundError: app` | Wrong root directory | Root Directory is `api`, not the repo root |
| Postgres "too many connections" | A pool crept back in | `api/app/db.py` must keep `poolclass=NullPool` |
| Wrong Python version | `.python-version` missing | `api/.python-version` must contain `3.12` |
| Web build fails on types | A real type error | Fix the type. Do not set `ignoreBuildErrors: true`. |
| `GET /app/main.py` returns your source | `vercel.json` used `rewrites` | Vercel checks the filesystem **before** `rewrites`, so every non-function file shadows the catch-all and is served as a static asset. Use `routes`, which runs first. This repo already does. |
| CLI deploy 404s everything, build takes ~1s | `vercel deploy` run from inside `api/` | The CLI uploads the current directory **and** the project then applies `rootDirectory: api` on top, so the effective root becomes `api/api/` — no `requirements.txt`, no function, just static files. Deploy with `git push` instead; that applies the root directory exactly once. |

## How deploys are triggered

Both projects build from GitHub pushes to `main`. `git push` rebuilds both.
Do **not** use `vercel deploy` from inside `api/` or `web/` — see the double
root-directory trap above.
