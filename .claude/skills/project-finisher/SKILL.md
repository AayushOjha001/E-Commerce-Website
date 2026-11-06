---
name: project-finisher
description: Autonomously finish (and optionally migrate, e.g. React+Vite+Node → Next.js) a broken or half-built software project (e.g. a full-stack e-commerce site with DB, backend API and frontend) in small verified batches — audit, plan, implement, self-review, commit, and push each batch to GitHub. Use this skill whenever the user asks to finish, fix, complete, continue, or "make work" an unfinished repo, wire up a database/backend/frontend, work continuously or overnight on a project, or push work in batches, or migrate a React/Vite/Express app to Next.js, even if they don't say "skill".
---

# Project Finisher

Turn a broken or half-built repo into a working app through small, verified, pushed batches. Every session starts cold, so **all state lives in files** under `docs/agent/`. Read them first, update them last.

## State files (create if missing)
- `docs/agent/AUDIT.md` — what exists, what is broken, detected stack, how to run.
- `docs/agent/PLAN.md` — batches with checkbox tasks. Single source of truth.
- `docs/agent/PROGRESS.md` — append-only log: date, batch, task, commit hash, result.
- `docs/agent/BLOCKERS.md` — anything needing the human (credentials, product decisions).

## Phase 0 — Audit (only if AUDIT.md missing)
1. Read README, package manifests, env examples, folder structure, existing routes/models/pages.
2. Detect stack (frontend framework, backend framework, DB + ORM, package manager, test runner).
3. Try install → build → start → tests. Record every error verbatim (short).
4. Write AUDIT.md. Commit: `chore(agent): project audit`.

## Phase 1 — Plan (only if PLAN.md missing)
Keep the existing stack unless the user asked for a migration. **If the user asked to move to Next.js (e.g. from React + Vite + Node/Express), read `references/nextjs-migration.md` and use its batch order instead** in place of the default e-commerce order. Otherwise use `references/ecommerce-batches.md` as the default batch order for e-commerce projects and adapt it to what the audit found. Each task must be small (≈1 commit) and have a clear "done" check. Commit: `chore(agent): initial plan`.

## Phase 2 — Work loop (one task at a time)
1. Read PLAN.md, PROGRESS.md, BLOCKERS.md. Pick the first unchecked, unblocked task in the current batch.
2. Implement it following existing code patterns.
3. Verify: build passes, relevant tests pass (write tests for new logic), app starts. For API tasks, hit the endpoint (curl or test). For frontend tasks, build must pass and the page must render data from the real API.
4. Self-review the diff (`git diff`) against the checklist below. If a `reviewer` subagent exists, use it. Fix every issue found.
5. Commit with Conventional Commits (`feat(cart): add to cart endpoint`). Tick the box in PLAN.md, append to PROGRESS.md.
6. If stuck after 3 genuine attempts: write it to BLOCKERS.md, mark the task `[~]`, move on.

### Self-review checklist
- Tests and build pass; no skipped/deleted tests to make things green.
- No secrets, keys, or real `.env` committed; new config vars added to `.env.example`.
- Input validation and error handling on every new endpoint; no SQL built by string concatenation.
- Passwords hashed; auth checked on protected routes; users can only access their own orders/cart.
- No dead code, console spam, or TODO left for the task just "done".
- Frontend handles loading, empty, and error states.

## Phase 3 — End of batch (push)
When every task in a batch is `[x]` or `[~]`:
1. Run the full build + full test suite. Fix failures before pushing.
2. Push to branch `agent/batch-<N>-<slug>` (never to main/master, never `--force`).
3. If `gh` is available, open a PR titled `Batch <N>: <name>` with a body listing tasks done, blockers, and how to test.
4. Log it in PROGRESS.md and continue with the next batch.

## Finishing
When all batches are done, update README (setup, env vars, run, test), then print exactly:
`ALL_BATCHES_COMPLETE`
If only blocked tasks remain, print `BLOCKED_NEEDS_HUMAN` instead. The loop script watches for these strings.

## Hard rules
- Never push to main/master, never force-push, never rewrite history.
- Never delete the database or run destructive migrations on anything except a local dev DB.
- Never print or commit secrets. Use `.env.example` with placeholders.
- Payments: use test/sandbox mode or a mock provider only.
- Don't upgrade major framework versions or swap the stack unless the user requested it (e.g. Next.js migration) or the audit shows it is unusable; log that decision in PROGRESS.md.
- During a migration, keep the old app runnable until the new one reaches parity; delete old code only in the final cleanup batch.
