# Migration: React + Vite + Node/Express → Next.js (App Router, full-stack)
Target: ONE Next.js app (latest stable, App Router, TypeScript) where the old Express
API becomes Route Handlers (`app/api/**/route.ts`) and business logic lives in
`src/server/` (services + DB access), callable from both route handlers and server
components/server actions. Keep the existing DB and schema if they work.

Strategy: build the Next.js app in a new folder `web/` alongside the old code, reach
parity feature by feature, then promote it to the repo root and delete old code.
Before starting, confirm in PLAN.md which option applies:
- **Option A (default): full-stack Next.js** — Express removed at the end.
- **Option B: Next.js frontend + keep Express API** — only if the user says so; then
  skip "port API" tasks and point the frontend at the Express API via env var.

## Batch 1 — Foundation & audit of old app
- Old app: install/build/run; list every Express route and every Vite page in AUDIT.md (this is the parity checklist)
- Scaffold `web/` with create-next-app (TypeScript, App Router, ESLint, Tailwind if the old app used utility CSS; else keep existing CSS approach)
- `.env.example` for web/; config loader with validation (e.g. zod)
- DB connection in `src/server/db` (reuse existing ORM; if none, use Prisma); `/api/health` checks DB
- Test runner (Vitest) + one passing smoke test; `npm run build` passes

## Batch 2 — Data layer
- Port/define schema: User, Product, Category, Cart/CartItem, Order/OrderItem, Address
- Migrations + seed script; service-layer tests

## Batch 3 — Auth
- Auth in Next.js (Auth.js/NextAuth credentials, or port existing JWT logic into route handlers + httpOnly cookies)
- `middleware.ts` protecting /account, /checkout, /admin; roles customer/admin; tests

## Batch 4 — Port catalog API + pages
- Move product/category logic from Express into `src/server/services`; expose via route handlers
- Pages: home/catalog (server components, search/filter/pagination), product detail (dynamic route, metadata for SEO)
- Loading (`loading.tsx`), error (`error.tsx`), not-found states; tests

## Batch 5 — Cart, checkout, orders
- Cart (server actions or route handlers), stock checks
- Checkout → transactional order creation; payment in test/mock mode
- Pages: cart, checkout, order history, order detail; tests

## Batch 6 — Admin
- Admin product/category CRUD and order management pages + APIs, role-protected

## Batch 7 — Parity check & cutover
- Walk the AUDIT.md parity checklist; every old route/page has a Next.js equivalent (tick each)
- Move `web/` to repo root (or make it the main package), update scripts
- Delete Vite app and Express server; remove unused deps
- Full build + tests pass

## Batch 8 — Ship-ready
- GitHub Actions CI: install, lint, typecheck, test, build
- README: setup, env, migrate/seed, run, test, deploy (Vercel or Node server)
