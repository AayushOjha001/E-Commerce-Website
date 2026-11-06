# Blockers — things I need from you

Nothing here is blocking. Every item below has a working default, and each one only needs an
answer if you want something different.

---

## 🟡 BL-2 — Payment provider choice (needed in Batch 5, not before)

You said "payments in test/mock mode", and the old code has no payment dependency at all
(`paymentMethod` is a free-text string). I am proceeding with a **mock provider**: an internal
`MockPaymentProvider` behind a `PaymentProvider` interface, so orders can be marked paid end-to-end
with no external account and no keys.

**Answer only if you want something else:** should Batch 5 instead wire **Stripe test mode**? That
would need a `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` from you (test keys only — I will never
commit them; they go in `.env.local`, placeholders in `.env.example`).

**Default if you stay silent:** mock provider, interface kept swappable. No decision needed now.

---

## 🟡 BL-3 — Database: I am keeping MongoDB/Mongoose (confirm only if you disagree)

The migration reference suggests Prisma when no ORM exists, but this repo **already has Mongoose 8**
with four usable schemas. Rewriting to Postgres/Prisma would throw away the working data model and
any data you have.

**Decision taken:** keep **MongoDB + Mongoose**, add TypeScript types, run it locally via
`docker-compose` on **port 27018** (27017 is already taken on your machine by an unrelated
`qdrant_check-mongodb-1` container, which I have not touched).

**Tell me only if** you actually wanted a SQL database — that changes Batch 2 substantially.

---

## 🟢 BL-4 — Product content / seed data (cosmetic)

The old frontend hardcodes `iPhone 14` / `AirPods Pro` / `MacBook Air` with
`via.placeholder.com` images (a domain that no longer resolves reliably).

I will seed ~12 plausible demo products with local SVG placeholder images in Batch 2. If you have
real product data or an images folder you want used instead, drop it in and tell me where.

---

## 🟢 BL-5 — Deploy target (needed in Batch 8)

I will write the README for **both** `vercel` and a plain Node server unless you name one. No action
needed now.

---

## Answered / no longer blocking

- **BL-6 Batches never reached `master` — RESOLVED 2026-11-06.** PRs #2 and #3 had been merged
  into side branches. PRs #4 to #9 were merged into `master` on the user's instruction, and CI
  passed there. New PRs target `master` directly.

- **BL-1 `gh` authentication — RESOLVED 2026-09-29.** `gh auth status` now shows
  `Logged in to github.com account AayushOjha001`, and **PR #1 "Batch 1: Foundation" is open**
  against `master`: https://github.com/AayushOjha001/E-Commerce-Website/pull/1
  I can open PRs for later batches myself from here on.

- **Migration option** — you chose **Option A** (full-stack Next.js, Express ported to route handlers
  and deleted in Batch 7). Recorded in PLAN.md §Decisions.
- **New app location** — `web/`, with the old `backend/` + `frontend/` kept runnable until Batch 7.
