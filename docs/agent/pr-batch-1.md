## Batch 1: Foundation

First batch of the **React + Vite + Express → Next.js (App Router, TypeScript)** migration,
using **Option A** (full-stack Next.js; Express becomes route handlers and is deleted in Batch 7).

The new app lives in `web/`. The legacy `backend/` and `frontend/` are untouched and still
runnable — nothing is deleted until the Batch 7 cutover.

### Phase 0 — Audit

Everything in [`docs/agent/AUDIT.md`](docs/agent/AUDIT.md) was verified by **running** the old app
against a throwaway MongoDB, not by reading it. It includes a parity checklist of all **13 Express
routes** and **12 pages/components** that must be ticked before cutover.

The app is considerably more broken than "a few basic APIs" suggested:

| Verified | Evidence |
|---|---|
| Checkout can never succeed | `POST /api/orders` → `500 ReferenceError: product is not defined` (`orderController.js:22` uses `product`; the variable is `productExists`) |
| Product detail is a dead route | `router.route(":id")` is missing its leading slash → `404` on every real id |
| Product creation needs no auth | created a product with **no token**; no admin middleware exists anywhere despite `User.isAdmin` |
| Any user can read any order | `getOrderById` has no ownership check (IDOR) |
| Errors leak stack traces | no error middleware → HTML responses exposing `C:/Study/.../authMiddleware.js:28`, and the frontend reads `.data.message`, which is always `undefined` |
| Frontend is mostly a shell | 3 of 5 pages render hardcoded data; `AuthContext.jsx` and `CartContext.jsx` are **0-byte files** |
| Nothing was verifiable | no test runner, no `.env.example`, lint failing |

### Phase 1 — Plan

[`docs/agent/PLAN.md`](docs/agent/PLAN.md) — 8 batches, 11 locked decisions, and every audit defect
(B1–B17) mapped to the batch that fixes it. Two decisions worth review:

- **D2: kept MongoDB/Mongoose rather than Prisma.** The migration reference defaults to Prisma when
  no ORM exists, but this repo has Mongoose 8 with four sound schemas. Rewriting to SQL would
  discard a working data model.
- **D7: the frontend pages are a rewrite, not a port** — there is nothing to port in a page that
  hardcodes its data. Only `Loader`, `Message` and the Tailwind v4 setup carry over.

### What Batch 1 actually delivers

- [x] **T1.1** `docker-compose.yml` — MongoDB 7 on **host port 27018** (27017 is commonly taken), plus `backend/.env.example` (audit B15)
- [x] **T1.2** `web/` scaffolded: Next **16.3.6**, React 19.2.8, TS strict, App Router, Tailwind v4
- [x] **T1.3** zod-validated env loader, failing closed
- [x] **T1.4** Mongoose connection cached on `globalThis`, with concurrency dedupe and staleness detection
- [x] **T1.5** `GET /api/health` that really pings the DB and returns 503 when it cannot
- [x] **T1.6** Vitest + **29 tests**
- [x] **T1.7** root `README.md`; legacy frontend lint error fixed

### Review

The `reviewer` subagent returned `CHANGES_REQUIRED` with **9 findings; all 9 were fixed before these
commits landed.** The blocking four were worth the round trip:

1. **`/api/health` leaked env diagnostics.** With `JWT_SECRET` unset, the unauthenticated probe
   replied `"error":"Invalid environment variables:\n - JWT_SECRET: ..."` — telling an attacker
   which variables are missing and leaking paths — and blamed a healthy database for a config typo.
   Now returns a coarse `reason` enum (`configuration_error` / `database_unreachable`), with detail
   logged **server-side only**.
2. **A dropped connection was cached forever.** `if (cache.conn)` never checked `readyState`, and
   with `bufferCommands: false` every later query failed instantly — the process stayed permanently
   degraded with no path back short of a restart.
3. **The one test for T1.4's headline deliverable was a tautology.** `expect(second).toBe(first)`
   passes even with the cache deleted entirely, because `mongoose.connect()` always resolves to the
   mongoose singleton. I verified that independently before accepting it, then replaced it with a
   `vi.spyOn` assertion on the driver call.
4. **`JWT_SECRET` was length-checked only,** so the 53-character `.env.example` placeholder
   validated — a deploy that copied the example would boot on a signing secret that is public in
   this repo. Now rejected outright.

Afterwards the dedupe and staleness logic were **mutation-tested** — logic removed → the suite
fails; restored → passes — to confirm the new assertions are not rubber stamps.

### How to test

```bash
docker compose up -d mongo        # MongoDB 7 on host port 27018

cd web
cp .env.example .env.local
# generate a real secret; the placeholder is rejected on purpose
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm install
REQUIRE_DB=1 npm test             # 29 passed
npm run lint && npm run typecheck && npm run build
npm run dev                       # http://localhost:3000
curl localhost:3000/api/health    # {"status":"ok","db":"connected"}
```

To see the failure path, `docker compose stop mongo` and curl again: `503` with
`{"status":"degraded","db":"disconnected","reason":"database_unreachable"}`. Start it again and it
returns to `200` **without restarting the app**.

The legacy app still runs: `cd backend && cp .env.example .env && npm run dev`, and
`cd frontend && npm run dev`.

### Verified before pushing

`web/`: lint, typecheck, 29/29 tests and build all pass. `/api/health` checked across healthy,
DB-down and recovered states. Legacy backend boots; legacy frontend lints and builds clean. Only
`.env.example` files are tracked — no real `.env`, and no secret-looking values in the diff.

### Blockers

One thing I need — see [`docs/agent/BLOCKERS.md`](docs/agent/BLOCKERS.md): **`gh` is not
authenticated** on this machine (`gh auth status` → not logged in). The branch pushed fine via
stored git credentials, so if this PR was opened by hand, that is why.

Nothing else blocks Batch 2. Payments default to a **mock provider** (no keys needed) and the DB
decision is recorded — say so in BLOCKERS.md if you want Stripe test mode or SQL instead.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
