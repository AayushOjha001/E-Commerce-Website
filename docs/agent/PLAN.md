# Phase 1 — Migration Plan

Source: `.claude/skills/project-finisher/references/nextjs-migration.md`, adapted to what
`docs/agent/AUDIT.md` actually found. This file is the single source of truth for batch progress.

**Target:** one full-stack **Next.js (App Router, TypeScript)** app in `web/`, where the old Express
API becomes Route Handlers (`app/api/**/route.ts`) and business logic lives in `web/src/server/`
(services + DB access), callable from both route handlers and server components/actions.

---

## Decisions (locked)

| # | Decision | Why |
|---|---|---|
| D1 | **Option A — full-stack Next.js.** Express is ported to route handlers and deleted in Batch 7. | User chose Option A explicitly. |
| D2 | **Keep MongoDB + Mongoose 8**, typed with TS. *Not* Prisma/SQL. | Audit §6.1: four usable schemas already exist; the reference's "use Prisma" default only applies when there is no ORM. Rewriting to SQL would discard a sound data model. |
| D3 | **Local dev DB via `docker-compose` on port `27018`, as a single-node replica set.** | No local `mongod`; 27017 is occupied by an unrelated `qdrant_check-mongodb-1` container which must not be touched. Replica set (not standalone) because **transactions require one** — proven in Batch 2, see D13. |
| D4 | **Tailwind v4** in the new app (`@tailwindcss/postcss`). | Old app already used Tailwind v4 utility CSS, so the reference's "Tailwind if the old app used utility CSS" applies. |
| D5 | **Vitest** as the test runner, everywhere. | No runner exists today (audit §2). Reference names Vitest. |
| D6 | **Auth: port the existing JWT logic** into route handlers, but move the token to an **httpOnly cookie**. Not NextAuth. | Keeps the bcrypt/`isAdmin` model the audit found working, and fixes B17 (JWT in `localStorage`). Fewer moving parts than Auth.js for a credentials-only app. |
| D7 | **The frontend pages are a rewrite, not a port.** | Audit §6.2: 3 of 5 pages are hardcoded, both contexts are empty files. Only `Loader`, `Message` and the Tailwind setup carry over. |
| D8 | **Payments: mock provider** behind a swappable `PaymentProvider` interface. | User said test/mock mode; no payment dep exists. See BLOCKERS BL-2. |
| D9 | **Old app stays runnable** until Batch 7 (`backend/` + `frontend/` untouched except a `.env.example` and the lint fix). | Skill hard rule + user instruction. |
| D10 | Every fix for audit defects **B1–B17** is attached to the batch that ports the matching feature, so nothing is fixed twice. | Porting means fixing, not copying (audit §6.3). |
| D12 | **Mongoose 9.10.2 in `web/`**, not 8.19.1 as D2 first said. | Deviation from "keep Mongoose 8", logged per the skill's major-version rule. `npm install mongoose` resolved to the current major, and Batch 1 shipped and tested on it (29 tests, real DB). A greenfield app should take the current stable major rather than match the app being deleted. Verified behaviour differences: mongoose 9 **no longer throws** when a model name is re-registered (8 raised `OverwriteModelError`), so the `mongoose.models.X ??=` guard is kept for identity/hot-reload rather than to avoid a crash. |
| D14 | **The cart and order service logic landed in T2.4, not Batch 5.** Batch 5 now wires the existing services to route handlers and pages. | T2.4 ("service layer: products, cart, orders, users") and T5.1/T5.3/T5.4/T5.6 overlapped in the original plan. Writing the logic once in the data layer and exposing it later avoids duplicating it; the batch tasks above are reworded to say so. |
| D15 | **Dev MongoDB is a single-node replica set** (T2.0). | Transactions require one; a standalone mongod rejects them, which would have broken atomic order creation. Found by probing in Batch 2 rather than failing in Batch 5. |
| D13 | **Money stored as `Number`, rounded to 2dp at write time; arithmetic done in integer cents in services.** | Keeps the existing schema shape (D2) while avoiding float drift in totals. Revisit only if a currency with different minor units is added. |
| D16 | **Sessions carry a `tokenVersion`, bumped on password change.** | Stateless JWTs would otherwise leave a token stolen before a password change valid for its full remaining lifetime. A counter rather than a `passwordChangedAt` timestamp: a JWT's `iat` is whole seconds and cannot separate a token minted just before a change from one just after in the same second. |
| D17 | **Two guard flavours: `requireUser()` throws (handlers/actions), `requireUserForPage()` redirects (Server Components).** | A `ServiceError` thrown while rendering hits the error boundary and renders a **500**, not a login form. Found in review; it was reachable just by reseeding, which gives users new ids while an existing cookie stays cryptographically valid. |
| D11 | **Next.js 16.3.6.** Route protection uses **`proxy.ts`**, not `middleware.ts`. | Discovered in Batch 1 from the version-matched docs bundled at `web/node_modules/next/dist/docs/`: v16 renamed the `middleware` file and its named export to `proxy`, and the `edge` runtime is not supported there (`proxy` is always `nodejs`). Also in v16: Turbopack is the default, and `cookies()`/`headers()`/`params`/`searchParams` are **async-only** — synchronous access was removed. This affects T3.1–T3.4. |

---

## Batch 1 — Foundation ✅ complete

Goal: a `web/` Next.js app that builds, tests, lints, typechecks, and talks to a real local DB —
with the old app still runnable. **No product features yet.**

- [x] **T1.1** — `docker-compose.yml` at repo root with a `mongo:7` service on host port `27018`, named volume. `.env.example` for `backend/` documenting `PORT`/`MONGO_URI`/`JWT_SECRET` (fixes **B15**). *Done when:* `docker compose up -d mongo` is healthy and the old backend boots against it.
- [x] **T1.2** — Scaffold `web/` via `create-next-app` (TypeScript, App Router, ESLint, Tailwind v4, `src/` dir, no Turbopack flag in CI). Strip the boilerplate landing page to a placeholder. *Done when:* `npm run build` and `npm run lint` pass in `web/`.
- [x] **T1.3** — `web/.env.example` + typed config loader `src/lib/env.ts` validating `MONGODB_URI`, `JWT_SECRET`, `NODE_ENV` with **zod** (fail fast at boot). *Done when:* a missing var throws a readable error; no real secret is committed.
- [x] **T1.4** — Mongoose connection in `src/server/db/connect.ts` with the **global-cache pattern** (required: Next dev hot-reload otherwise opens a new pool per reload). *Done when:* repeated calls reuse one connection.
- [x] **T1.5** — `GET /api/health` route handler returning `{status, db}` and actually pinging the DB. *Done when:* `curl` returns `200` + `"db":"connected"` with mongo up, and a non-200 with mongo down.
- [x] **T1.6** — Vitest + one passing smoke test for the env loader and the health service. *Done when:* `npm test` passes and is wired into `package.json`.
- [x] **T1.7** — Root `README.md` section: how to run old app + new app side by side; `docs/agent/PROGRESS.md` started. *Done when:* a fresh clone can follow it.

**Batch 1 exit criteria:** in `web/` — `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`
all pass; `/api/health` reports a live DB; `backend/` + `frontend/` still run.

---

## Batch 2 — Data layer ✅ complete
- [x] **T2.0** *(added during Batch 2)* — Convert the dev MongoDB to a single-node replica set so transactions work. *Done when:* a transactional write commits and an aborted one rolls back.
- [x] **T2.1** — Port schemas to TS models in `src/server/models/`: `User`, `Product`, `Category` (new — old app had only a `category` string), `Cart`/`CartItem`, `Order`/`OrderItem`, `Address`. Fix **B8** (`countInStock` → `Number`), **B10** (`timestamps` typo), **B9** (missing `return` in the password hook), **B11** (`orderItems.image`).
- [x] **T2.2** — Model-level indexes + uniqueness (`user.email`, `cart.user`, product text index for search).
- [x] **T2.3** — Seed script (`npm run seed`) with ~12 demo products, local placeholder images, one admin + one customer user. Idempotent.
- [x] **T2.4** — Service layer `src/server/services/` (products, cart, orders, users) — pure functions over models, no `req`/`res`. Unit tests with an in-memory/throwaway DB.

## Batch 3 — Auth ✅ complete
- [x] **T3.1** — `src/server/auth/` — bcrypt hashing, JWT sign/verify, session read from httpOnly cookie.
- [x] **T3.2** — `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/users/profile` (ports **R2–R4**) with **zod** input validation. Fixes the `"credintials"` typo.
- [x] **T3.3** — Shared API error helper so every handler returns **JSON** `{message}`, never an HTML stack trace (fixes **B6**).
- [x] **T3.4** — `proxy.ts` (**not** `middleware.ts` — renamed in Next 16, see D11) protecting `/account`, `/checkout`, `/admin`; `requireUser()` / `requireAdmin()` guards for handlers (fixes **B5** — admin middleware did not exist at all).
- [x] **T3.5** — Login/register/logout UI (ports **P4/P5**) as server actions; auth state in the header (fixes **C1**).
- [x] **T3.6** — Tests: register/login/logout, wrong password, protected-route redirect, non-admin blocked from admin.

## Batch 4 — Catalog ✅ complete
- [x] **T4.1** — `GET /api/products` with **pagination, search, category filter, sort** (fixes **B5**/R5 gap).
- [x] **T4.2** — `GET /api/products/[id]` — the route that never worked (fixes **B1**, **B7**).
- [x] **T4.3** — Home/catalog page as a server component with real DB data + search/filter/pagination UI (replaces **P1**).
- [x] **T4.4** — Product detail page, dynamic route + `generateMetadata` for SEO (replaces **P2**). Uses `_id` correctly (fixes **C2**).
- [x] **T4.5** — `loading.tsx`, `error.tsx`, `not-found.tsx` for the shop segment.
- [x] **T4.6** — Tests: list/filter/pagination service, detail 404 path.

## Batch 5 — Cart, checkout, orders ✅ complete
- [x] **T5.1** — Expose the cart service (built in T2.4) via `GET/POST /api/cart` and `DELETE /api/cart/[productId]` (ports **R8–R10**). Validation, stock checks and correct qty incrementing are already done and tested.
- [x] **T5.2** — Cart page with server data + optimistic updates (replaces **P3**, the `"No items yet."` stub).
- [x] **T5.3** — Checkout page/flow on top of the pricing service (built in T2.4, which already computes all totals server-side — **B3** fixed there).
- [x] **T5.4** — `POST /api/orders` route handler over `createOrderFromCart` (built in T2.4: transactional, atomic stock decrement — **B2**/**B13** fixed and race-tested there).
- [x] **T5.5** — Mock payment provider behind a `PaymentProvider` interface; mark order paid (BL-2).
- [x] **T5.6** — `GET /api/orders` and `GET /api/orders/[id]` route handlers over the order service (ownership check + **B4** IDOR fix already implemented and mutation-tested in T2.4).
- [x] **T5.7** — Pages: checkout, order confirmation, order history, order detail.
- [x] **T5.8** — Tests: stock rejection, total correctness, IDOR is denied, empty-cart checkout rejected.

## Batch 6 — Admin ✅ complete
- [x] **T6.1** — Admin product CRUD API (create/update/delete), admin-only (properly fixes **B5**).
- [x] **T6.2** — Admin category CRUD API.
- [x] **T6.3** — Admin order list + status updates (mark paid/delivered).
- [x] **T6.4** — Admin UI pages (products table + form, orders table), role-gated.
- [x] **T6.5** — Tests: non-admin gets 403 on every admin route.

## Batch 7 — Parity check & cutover ✅ complete
- [x] **T7.1** — Walk the **AUDIT.md parity checklist** and tick every row (13 routes + 12 pages).
- [x] **T7.2** — Promote `web/` to the repo root; update scripts/paths.
- [x] **T7.3** — Delete `backend/` and `frontend/`; remove unused deps. *Only now* (D9).
- [x] **T7.4** — Full build + full test suite pass.

## Batch 8 — Ship-ready
- [ ] **T8.1** — GitHub Actions CI: install, lint, typecheck, test, build.
- [ ] **T8.2** — README: setup, env vars, seed, run, test, deploy (Vercel + plain Node).
- [ ] **T8.3** — Final security pass: no secrets, CORS/headers (**B14**), rate limit on auth.

---

## Defect → batch mapping (audit traceability)

| Defect | Fixed in |
|---|---|
| B1 dead `:id` route, B7 missing `await` | T4.2 |
| B2 order ReferenceError, B13 stock decrement | T5.4 |
| B3 client-controlled totals | T5.3 |
| B4 order IDOR | T5.6 |
| B5 unauthenticated product write | T3.4 + T6.1 |
| B6 HTML stack traces | T3.3 |
| B8 `countInStock` String, B9 re-hash, B10 timestamps typo, B11 missing image | T2.1 |
| B12 dead code in server.js | T7.3 (file is deleted) |
| B14 open CORS | T8.3 |
| B15 no `.env.example` | T1.1 + T1.3 |
| B16 hardcoded API URL | T7.3 (old frontend deleted) |
| B17 JWT in localStorage | T3.1 (httpOnly cookie) |
| C2 `product.id` vs `_id` | T4.4 |
| X1/X2 empty contexts | T3.5 / T5.2 |
