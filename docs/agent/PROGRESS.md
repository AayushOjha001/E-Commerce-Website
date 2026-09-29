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
