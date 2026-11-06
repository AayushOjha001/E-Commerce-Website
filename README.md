# E-Commerce Website

A full-stack e-commerce site, **mid-migration** from React + Vite + Express to a single
Next.js (App Router, TypeScript) application.

> **Status:** Batch 1 (Foundation) complete. The new app in `web/` boots, connects to the
> database and reports health, but has no storefront features yet. The legacy app still
> holds all existing functionality. See [docs/agent/PLAN.md](docs/agent/PLAN.md) for the
> batch plan and [docs/agent/AUDIT.md](docs/agent/AUDIT.md) for the parity checklist.

## Layout

| Path | What it is |
|---|---|
| `web/` | **New** Next.js 16 full-stack app (App Router, TypeScript). Where all new work happens. |
| `backend/` | **Legacy** Express + Mongoose API. Runnable until the Batch 7 cutover, then deleted. |
| `frontend/` | **Legacy** React + Vite SPA. Same. |
| `docs/agent/` | Migration audit, plan, progress log and open blockers. |

Both apps talk to the same local MongoDB, so you can run them side by side while the
migration proceeds.

## Prerequisites

- **Node.js 20.9+** (developed on 22.20; Next.js 16 requires ≥20.9)
- **Docker** — for the local MongoDB. There is no need to install MongoDB itself.

## 1. Start the database

From the repo root:

```bash
docker compose up -d mongo
```

This runs MongoDB 7 on **port 27018** as a **single-node replica set**, and initiates the set
automatically on first start.

Two deliberate choices:

- **Port 27018**, not the default 27017, to avoid colliding with any MongoDB you already run.
- **A replica set**, not a standalone mongod, because multi-document transactions require one.
  A standalone deployment rejects them (`This MongoDB deployment does not support retryable
  writes`), which would break atomic order creation.

Wait for it to be ready — `docker compose ps` should show `ecommerce-mongo` as `healthy`. The
healthcheck only passes once a primary has been elected, so "healthy" really means usable:

```bash
docker compose ps
```

## 2. Run the new Next.js app (`web/`)

```bash
cd web
cp .env.example .env.local     # then edit: generate a real JWT_SECRET
npm install
npm run dev                    # http://localhost:3000
```

Generate a secret for `.env.local` — the placeholder is rejected on purpose:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then load the demo catalog:

```bash
npm run seed
```

That upserts 5 categories, 12 products (one deliberately out of stock, so stock
handling has something real to work against) and two accounts. It is **idempotent** — run it as
often as you like without duplicating data. Add `-- --reset` to also clear carts and orders.

| Demo account | Password | Role |
|---|---|---|
| `admin@example.com` | `Password123!` | admin |
| `customer@example.com` | `Password123!` | customer |

These are local development credentials, not secrets. Override with `SEED_PASSWORD=...`. The
script refuses to run with `NODE_ENV=production` unless `ALLOW_PRODUCTION_SEED=1`, since it
creates accounts with a published password.

Verify it is wired up: <http://localhost:3000/api/health> should return
`{"status":"ok","db":"connected"}`. If it returns `503` with
`"reason":"database_unreachable"`, step 1 is not running; `"configuration_error"` means
`.env.local` is missing or invalid (details are printed to the server log, not the
response).

### Scripts (`web/`)

| Command | Does |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest, watch mode |
| `npm run seed` | Load the demo catalog and users (idempotent) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

Tests that need the database **skip themselves** when it is unreachable, so `npm test`
passes on a fresh clone. Set `REQUIRE_DB=1` to make an unreachable database a hard
failure instead (CI does this):

```bash
REQUIRE_DB=1 npm test
```

### Environment variables (`web/`)

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | yes | Must have a `mongodb://` / `mongodb+srv://` scheme and a host. |
| `JWT_SECRET` | yes | ≥32 chars. The `.env.example` placeholder is rejected. |
| `NODE_ENV` | no | Defaults to `development`. |

Validated by zod at first use, so a bad value fails immediately with all problems listed.

## 3. Run the legacy app (optional)

Only needed to compare against the old behaviour; it holds the features not yet ported.

```bash
# API
cd backend
cp .env.example .env           # edit JWT_SECRET
npm install
npm run dev                    # http://localhost:5000

# SPA, in another terminal
cd frontend
npm install
npm run dev                    # http://localhost:5173
```

Be aware the legacy app is substantially broken — product detail 404s and checkout
returns a 500. [docs/agent/AUDIT.md](docs/agent/AUDIT.md) lists every defect.

## Secrets

Never commit a real `.env`. Only `.env.example` files are tracked, and they contain
placeholders only. `web/.gitignore` ignores `.env*` with an explicit `!.env.example`
exception.
