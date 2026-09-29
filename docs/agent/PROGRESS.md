# Progress log (append-only)

Format: `date · batch/task · result · commit`

---

## 2026-09-29

- **Phase 0 · audit** — Audited the repo by running it, not just reading it. Stood up a throwaway
  `mongo:7` container on host port 27018 (27017 was already taken by an unrelated project's
  container, left untouched) and probed all 13 Express routes. Confirmed at runtime: product detail
  404s, order creation 500s with `ReferenceError: product is not defined`, product creation needs no
  auth, errors return HTML stack traces. Wrote `AUDIT.md` (parity checklist: 13 routes, 12
  pages/components) and `BLOCKERS.md`. Result: ✅ · commit `9338700`
- **Phase 1 · plan** — Wrote `PLAN.md` from `references/nextjs-migration.md`, adapted to the audit.
  Key adaptation: **kept MongoDB/Mongoose instead of the reference's Prisma default** (D2), since
  four usable schemas already exist. Locked 10 decisions and mapped all 17 audit defects to the
  batch that fixes each. Result: ✅ · commit `77e4854`

### Batch 1 — Foundation ✅

- **T1.1** — `docker-compose.yml` (mongo:7, host port 27018) + `backend/.env.example`. Verified
  compose reports `healthy` and the legacy backend boots against it. Result: ✅ · commit `98401ee`
- **T1.2** — Scaffolded `web/` with create-next-app: **Next 16.3.6**, React 19.2.8, TS strict, App
  Router, Tailwind v4. Caught that the scaffold's `.gitignore` had a bare `.env*`, which would have
  silently swallowed `.env.example`; added `!.env.example`. Result: ✅ · commit `73ef951`
- **T1.6a** — Vitest + deps. Hit a real peer conflict: vitest 5 needs `@types/node` ^22, the scaffold
  pinned ^20. Fixed by aligning types to the Node 22.20 runtime actually in use rather than reaching
  for `--legacy-peer-deps`. Result: ✅ · commit `b22615e`
- **T1.3** — zod env loader. Rejects the `.env.example` placeholder secret and validates the Mongo
  URI has a real host. Result: ✅ · commit `23a52d4`
- **T1.4** — Mongoose connection cached on `globalThis`, with concurrency dedupe and staleness
  detection. Result: ✅ · commit `a6c9d34`
- **T1.5** — `GET /api/health`. Result: ✅ · commit `beda61e`
- **T1.7** — Root `README.md` (run both apps side by side) + fixed the legacy frontend's lint error.
  Result: ✅ · commit _(this commit)_

**Reviewer pass:** the `reviewer` subagent returned `CHANGES_REQUIRED` with 9 findings; all 9 were
fixed before the commits landed. The four blocking ones were worth the round trip:

1. `/api/health` echoed the env-validation message to unauthenticated callers (naming missing
   variables and leaking paths) and mislabelled config errors as DB failures. Now returns a coarse
   `reason` enum, with detail logged server-side only.
2. A dropped connection was cached forever — `if (cache.conn)` never checked `readyState`, so with
   `bufferCommands: false` the process stayed permanently broken. Now revalidates and reconnects.
3. The one test for T1.4's headline deliverable was a tautology: `expect(second).toBe(first)` passes
   even with the cache deleted, because `mongoose.connect()` always resolves to the mongoose
   singleton. **I verified this independently before accepting it.** Replaced with a `vi.spyOn`
   assertion on the driver call.
4. `JWT_SECRET` was length-checked only, so the 53-char `.env.example` placeholder validated — a
   deploy copying the example would boot on a secret that is public in the repo. Now rejected.

After fixing, both the dedupe and the staleness check were **mutation-tested** (logic removed → the
suite fails; restored → passes) to confirm the new tests are not rubber stamps.

**Verified at the end of Batch 1:** `npm run lint`, `npm run typecheck`, `npm test` (29 passed with
`REQUIRE_DB=1`) and `npm run build` all pass in `web/`. `/api/health` returns 200/`connected` with
the DB up, 503/`database_unreachable` with it stopped, and recovers to 200 without an app restart.
Legacy `backend/` boots and legacy `frontend/` lints and builds clean.

**Note for the next session:** `docker compose up -d mongo` must be running for the DB-backed tests
to execute; without it they skip (by design). Use `REQUIRE_DB=1 npm test` to force them.

- **Batch 1 · push & PR** — Pushed 9 commits to `agent/batch-1-foundation`. `gh pr create` initially
  failed (CLI unauthenticated, BL-1); the user then ran `gh auth login`, and **PR #1 "Batch 1:
  Foundation"** is now open against `master`:
  https://github.com/AayushOjha001/E-Commerce-Website/pull/1 — BL-1 resolved. Result: ✅

### Batch 2 — Data layer ✅

- **T2.0** *(unplanned, found by probing)* — The dev MongoDB was a standalone mongod, which **rejects
  transactions** (`This MongoDB deployment does not support retryable writes`). That would have
  broken atomic order creation in Batch 5. Converted to a single-node replica set on port 27018;
  verified a transactional write commits and an aborted one rolls back. Result: ✅ · commit `ff22238`
- **T2.1/T2.2** — Typed models + indexes, fixing audit **B8** (`countInStock` was `String`, so `"10" <
  "9"`), **B9** (password re-hash locked users out), **B10** (`timestamp` typo meant no cart
  timestamps) and **B11** (required `image` the code never set). `isAdmin` became `role`. Result: ✅ ·
  commit `5a475fa`
- **T2.3** — Idempotent seed: 5 categories, 12 products (one deliberately out of stock), 2 accounts,
  12 committed local SVGs replacing the dead `via.placeholder.com` images. Result: ✅ · commit `3d7a914`
- **T2.4** — Service layer, in two commits: products/categories/users/pricing (`055b8d4`), then
  cart/orders with atomic checkout (`013ef52`). This is where the audit's worst defects are actually
  fixed: **B2** (order creation always 500'd), **B3** (client-controlled prices; tax/shipping silently
  0), **B4** (order IDOR), **B13** (stock never decremented), **R9** (cart qty overwritten rather than
  incremented), **R5** (no pagination/search/filter/sort).
- **Review fixes** — commit `60258fc`, see below.

**Reviewer pass:** `CHANGES_REQUIRED`, 17 findings, all addressed. The reviewer confirmed the stock
decrement is genuinely race-free and the IDOR fix airtight, then found four things worth the round
trip:

1. **`NaN` bypassed the paging clamp entirely.** It survives `Math.trunc`/`min`/`max`, and Mongo reads
   `.limit(NaN)` as *no limit* — so the clamp inverted into "return the whole collection", the exact
   opposite of its own docstring. `?limit=abc` via `Number()` produces it.
2. **Price bounds reached Mongo unvalidated**, raising a raw `CastError` that would surface as a 500
   with driver internals in it.
3. **The seed's production guard was dead code.** It keyed on `NODE_ENV === "production"`, but `tsx`
   sets no `NODE_ENV`, so for the documented `npm run seed` it never fired once. Rewritten to inspect
   the target host; verified it now refuses a real `mongodb+srv://` URI.
4. **`createUser` accepted a `role`** and is what registration will call in Batch 3 — a handler
   spreading a request body into it would have granted self-elevation. Split out `registerCustomer`.

It also caught a **vacuous test** of mine: "combines search with a category filter" passed with the
filter removed, because the search term alone already produced the expected count.

**Mutation tests** (logic removed → suite fails; restored → passes) on the two security-critical
paths: removing the ownership check fails the IDOR test, and removing the atomic stock guard makes
two concurrent checkouts *both* succeed and oversell.

**Verified at the end of Batch 2:** 222 tests pass with `REQUIRE_DB=1`; lint, typecheck and build
clean; `npm run seed` idempotent across runs and refusing a non-local target; legacy app still runs.

**Plan refinement (D14):** T2.4 and Batch 5's T5.1/T5.3/T5.4/T5.6 overlapped — both described writing
the cart/order services. The logic landed once here in the data layer; Batch 5 now wires it to route
handlers and pages. The Batch 5 task text is updated to say so.
