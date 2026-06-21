# Deployment guide

The application ships as two Docker images — **api** (Node.js) and **web**
(static SPA served by nginx) — plus a **PostgreSQL** database. The *same images*
run locally and in the cloud; only environment variables and the database
connection change between environments.

```
browser ──▶ web (nginx :80) ──/api──▶ api (Node :3000) ──▶ PostgreSQL
                 │
                 └─ serves the built React SPA, proxies /api to the API
```

Because nginx proxies `/api` to the API container, the browser talks to a single
origin — so auth cookies work without CORS juggling.

---

## Run the whole stack locally

Prerequisites: Docker with Compose v2.

```bash
docker compose up --build
```

This builds all three services and starts them:

- **Web app:** http://localhost:8080
- **API:** http://localhost:3000 (health check: `GET /api/health`)
- **PostgreSQL:** localhost:5432

The API migrates the database automatically on boot (`MIGRATE_ON_START=true` in
compose), so there is no separate migration step. Register the first user in the
app — they become the admin.

Stop with `Ctrl-C`; `docker compose down` removes the containers (add `-v` to
also drop the database volume `costing-db-data`).

### Local notes

- `NODE_ENV` defaults to `development` in compose so auth cookies work over plain
  `http://localhost`. **Do not** use this default in production (see below).
- To try the app without Docker at all, set `DATABASE_URL=pglite` and run
  `npm run dev` — an in-process database, no Postgres needed.

---

## Configuration (environment variables)

All configuration comes from the environment (never hard-coded). Copy
`.env.example` to `.env` for local overrides; Compose reads it automatically.

| Variable | Used by | Notes |
| --- | --- | --- |
| `NODE_ENV` | api | `production` in the cloud (enables secure, `SameSite=None` cookies — requires HTTPS). `development` for local http. |
| `PORT` | api | API listen port (default 3000). |
| `DATABASE_URL` | api | PostgreSQL connection string. In compose it points at the `db` service. |
| `MIGRATE_ON_START` | api | `true` to run migrations on boot. Set in compose; for managed Postgres you may prefer to run `npm run db:migrate` as a release step instead. |
| `JWT_SECRET` | api | **Must** be a long random value in production. With `NODE_ENV=production` the API refuses to start while this is still the dev default — set it before deploying. |
| `JWT_EXPIRES_IN` | api | Session lifetime (default `7d`). |
| `ALLOWED_ORIGIN` | api | Allowed browser origin(s) for CORS, comma-separated; set to the public web URL in production. (`WEB_ORIGIN` is accepted as a fallback.) With the nginx proxy this isn't strictly needed (same origin). |
| `MAX_UPLOAD_MB` | api | Max accepted upload size in MB (default 50); sizes both the file-upload and JSON body limits. |
| `AI_PROVIDER` / `GEMINI_API_KEY` / `GEMINI_MODEL` | api | AI assistant. Blank key → assistant runs in "not configured" mode; the rest of the app is unaffected. |
| `SAP_BASE_URL` / `SAP_CLIENT` / `SAP_USERNAME` / `SAP_PASSWORD` | api | SAP S/4HANA. Blank → SAP disabled; the app runs fully on Excel. See `docs/SAP_INTEGRATION.md`. |
| `VITE_API_URL` | web (build arg) | Base URL of the API as seen by the browser. **Blank** → relative `/api`, proxied by nginx (recommended). Set to a full URL only if the API is on a different host. |

> `VITE_API_URL` is baked in at **build time** (Vite inlines client env). To point
> the web image at a different API host, rebuild with
> `--build-arg VITE_API_URL=https://api.example.com`.

---

## Deploying to the cloud

The images are environment-agnostic. A typical deployment:

1. **Database** — provision managed PostgreSQL; note its connection string.
2. **Build & push images** to your registry:
   ```bash
   docker build -f apps/api/Dockerfile -t <registry>/costing-api:<tag> .
   docker build -f apps/web/Dockerfile -t <registry>/costing-web:<tag> .
   docker push <registry>/costing-api:<tag>
   docker push <registry>/costing-web:<tag>
   ```
   (Build context is the repo root — the Dockerfiles are workspace-aware.)
3. **Run the API** with cloud env vars:
   - `NODE_ENV=production`
   - `DATABASE_URL=<managed-postgres-url>`
   - `JWT_SECRET=<long-random-secret>`
   - `WEB_ORIGIN=https://app.example.com`
   - optional `GEMINI_API_KEY`, `SAP_*`
   - either keep `MIGRATE_ON_START=true`, or run `npm run db:migrate` as a
     one-off release task.
4. **Run the web** image behind your TLS terminator. If the web and API share a
   public hostname (web proxies `/api`), the default blank `VITE_API_URL` is
   correct. If the API is on its own hostname, rebuild the web image with that
   `VITE_API_URL` and set the API's `WEB_ORIGIN` accordingly.
5. **HTTPS is required in production** — secure cookies (`NODE_ENV=production`)
   are only sent over HTTPS.

### Health checks

- API: `GET /api/health` returns `200` with a small JSON body.
- Web: `GET /` returns the SPA shell.

Point your platform's liveness/readiness probes at these.

---

## Building images individually

```bash
# from the repo root
docker build -f apps/api/Dockerfile -t costing-api .
docker build -f apps/web/Dockerfile -t costing-web .
```

Both Dockerfiles are multi-stage: a Node builder compiles the workspace, and a
slim runtime stage carries only what's needed (the API drops dev dependencies;
the web stage is just nginx + static files).
