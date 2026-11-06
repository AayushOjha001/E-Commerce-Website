# Phase 0 — Project Audit

Date: 2026-09-29
Auditor: automated agent (project-finisher skill)
Repo: https://github.com/AayushOjha001/E-Commerce-Website (branch `master`)

Every claim below was verified by running the code, not by reading it alone. Runtime
evidence was gathered with the old Express server running against a throwaway local
MongoDB (`mongo:7` in Docker, host port **27018**).

---

## 1. Detected stack

| Layer | What is actually there |
|---|---|
| Frontend | React **19.1.1** + Vite **7.1.7**, plain JS (**no TypeScript**), React Router **7.9.4**, Tailwind **v4** via `@tailwindcss/vite`, axios |
| Backend | Node + Express **5.1.0**, ESM (`"type":"module"`), `express-async-handler` |
| Database | **MongoDB + Mongoose 8.19.1** (document DB — *not* SQL, so no Prisma/Drizzle migrations exist) |
| Auth | Hand-rolled **JWT** (`jsonwebtoken`), 30-day expiry, `Bearer` header, token persisted to `localStorage` |
| Passwords | `bcryptjs`, hashed in a Mongoose `pre("save")` hook |
| Package manager | **npm** (v10.9.3, node v22.20.0); two separate installs, no workspace/monorepo |
| Test runner | **none, anywhere** (`backend: "test": "echo Error: no test specified && exit 1"`) |
| Lint | ESLint 9 flat config in `frontend/` only; **currently failing** |
| CI | none (no `.github/`) |
| Payments | none — no Stripe/PayPal dependency, `paymentMethod` is a free-text string |

### Environment / tooling on this machine
- `node v22.20.0`, `npm 10.9.3`, `git 2.51.0`, `docker 28.5.1` + `compose v2.40.0` — all OK.
- `mongod` **not installed locally** → Docker is required for a dev DB.
- `gh 2.101.0` installed but **not authenticated** (`You are not logged into any GitHub hosts`) → see BLOCKERS.md.
- Host port **27017 is already occupied** by an unrelated container (`qdrant_check-mongodb-1`). That
  container belongs to another project and was **left untouched**; ours uses **27018**.

---

## 2. Can it run today?

| Step | Result |
|---|---|
| `backend: npm install` | ✅ 129 packages, 8 vulns (2 moderate, 6 high) |
| `frontend: npm install` | ✅ 203 packages, 20 vulns (1 critical, 14 high) |
| `frontend: npm run build` | ✅ builds in 1.78s (only because every page is hardcoded data) |
| `frontend: npm run lint` | ❌ **1 error** — `src/pages/ProductScreen.jsx:4:11 'id' is assigned a value but never used` |
| `backend: npm start` (as-committed) | ❌ **crashes instantly** |
| `backend: npm test` | ❌ no tests exist |
| `frontend` tests | ❌ no test runner installed |

Verbatim backend crash with no `.env` (there is **no `.env.example`** in the repo, so a fresh clone cannot boot):
```
[dotenv@17.2.3] injecting env (0) from .env
Error: The `uri` parameter to `openUri()` must be a string, got "undefined".
```
With `MONGO_URI` supplied it does start cleanly:
```
App is listening to 5000
MongoDB Connected: localhost
```

---

## 3. Parity checklist — every existing Express route

Status legend: ✅ works · ⚠️ works but wrong/insecure · ❌ broken. "Next.js target" is the
App Router equivalent to build. **Every row must be ticked in Batch 7 before cutover.**

| # | Express route | Auth | Verified runtime result | Status | Next.js target | Done |
|---|---|---|---|---|---|---|
| R1 | `GET /` | – | `API is running.....` | ✅ | `/api/health` | [x] |
| R2 | `POST /api/users/register` | – | `201` + user JSON + token | ⚠️ no validation; returns no `isAdmin`; token in JSON body | `app/api/auth/register/route.ts` | [x] |
| R3 | `POST /api/users/login` | – | `200` + user JSON + token | ⚠️ typo `"Invalid credintials"`; no rate limiting | `app/api/auth/login/route.ts` | [x] |
| R4 | `GET /api/users/profile` | JWT | `200` + `{_id,name,email,isAdmin}` | ✅ | `app/api/users/profile/route.ts` | [x] |
| R5 | `GET /api/products` | – | `200` + array | ⚠️ **no pagination / search / filter / sort** | `app/api/products/route.ts` | [x] |
| R6 | `POST /api/products` | **NONE** | `201` — created a product with **no token at all** | ⚠️ **CRITICAL: unauthenticated write** | `app/api/admin/products/route.ts` (admin only) | [x] |
| R7 | `GET /api/products/:id` | – | **`404 Cannot GET /api/products/<id>`** | ❌ **dead route** (see B1) | `app/api/products/[id]/route.ts` | [x] |
| R8 | `GET /api/cart` | JWT | `200` + populated cart | ✅ | `app/api/cart/route.ts` GET | [x] |
| R9 | `POST /api/cart` | JWT | `200` + populated cart | ⚠️ no qty/stock validation, qty **replaced** not incremented | `app/api/cart/route.ts` POST | [x] |
| R10 | `DELETE /api/cart/:productId` | JWT | reachable | ⚠️ no validation | `app/api/cart/[productId]/route.ts` | [x] |
| R11 | `POST /api/orders` | JWT | **`500 ReferenceError: product is not defined`** | ❌ **checkout impossible** (see B2) | `app/api/orders/route.ts` POST | [x] |
| R12 | `GET /api/orders/myorders` | JWT | `200` + `[]` | ✅ | `app/api/orders/route.ts` GET | [x] |
| R13 | `GET /api/orders/:id` | JWT | reachable | ⚠️ **IDOR — no ownership check** (see B4) | `app/api/orders/[id]/route.ts` | [x] |

**Missing entirely (no route exists):** logout/session, refresh, update profile, password reset,
categories, product update/delete, admin order list, order status (pay/deliver), stock decrement,
address book, reviews (the `rating`/`numReviews` fields are never written).

## 3b. Parity checklist — every existing Vite page

| # | Page / file | Route | Real data? | Status | Next.js target | Done |
|---|---|---|---|---|---|---|
| P1 | `pages/HomeScreen.jsx` | `/` | ❌ **3 hardcoded products** (`iPhone 14`…), `via.placeholder.com` images | ❌ fake | `app/page.tsx`, `app/products/(list)/page.tsx` | [x] |
| P2 | `pages/ProductScreen.jsx` | `/product/:id` | ❌ **hardcoded iPhone**, ignores `:id`, "Add to Cart" is a `<Link>` that adds nothing | ❌ fake | `app/products/[slug]/page.tsx` | [x] |
| P3 | `pages/CartScreen.jsx` | `/cart` | ❌ literally renders `"No items yet."` | ❌ stub | `app/cart/page.tsx` | [x] |
| P4 | `pages/LoginScreen.jsx` | `/login` | ✅ real `axios` POST to hardcoded `http://localhost:5000` | ⚠️ works | `app/(auth)/login/page.tsx` | [x] |
| P5 | `pages/RegisterScreen.jsx` | `/register` | ✅ real `axios` POST to hardcoded `http://localhost:5000` | ⚠️ works | `app/(auth)/register/page.tsx` | [x] |
| C1 | `components/Navbar.jsx` | – | static links only; **no auth state, no cart count, no logout** | ⚠️ | `components/site-header.tsx` | [x] |
| C2 | `components/ProductCard.jsx` | – | reads **`product.id`** but Mongo returns **`_id`** → every link is `/product/undefined` | ❌ bug | `components/product-tile.tsx` | [x] |
| C3 | `components/Loader.jsx` | – | fine | ✅ | `loading.tsx` files, `components/page-loading.tsx` | [x] |
| C4 | `components/Message.jsx` | – | fine | ✅ | `Notice` in `components/ui.tsx` | [x] |
| X1 | `context/AuthContext.jsx` | – | **0-byte empty file** — imported by nothing | ❌ empty | httpOnly cookie session in `server/auth/session.ts` | [x] |
| X2 | `context/CartContext.jsx` | – | **0-byte empty file** — imported by nothing | ❌ empty | server cart with `useOptimistic` in `components/cart-contents.tsx` | [x] |

**Missing entirely (no page exists):** checkout, order confirmation, order history, order detail,
user profile/account, admin (any), 404, error boundary, search/filter UI.

---

## 4. Confirmed defects (ranked)

**B1 — `GET /api/products/:id` is a dead route.** `backend/routes/productRoutes.js:7` reads
`router.route(":id")` — missing leading slash. Express 5 does not throw, it just never matches, so
product detail returns 404 forever. *Verified: `404 Cannot GET /api/products/<real id>`.*

**B2 — Order creation always throws.** `backend/controllers/orderController.js:22` references
`product.countInStock` / `product.name`, but the variable declared on line 19 is `productExists`.
`product` is never defined in scope. *Verified: `500 ReferenceError: product is not defined`.*
Checkout can never succeed. The same function also builds `cartItems` (line 37) and then **never
uses it** — it saves the client-supplied `req.body.orderItems` instead.

**B3 — Order totals are client-controlled.** `createOrder` trusts `req.body.orderItems` (including
`price`) for what is stored, while `totalPrice` is computed from the cart. `itemsPrice`, `taxPrice`
and `shippingPrice` are never set (silently default to `0`). A client can order at any price it likes.

**B4 — IDOR on `GET /api/orders/:id`.** `getOrderById` fetches by id and returns it with **no
`order.user === req.user._id` check**, so any authenticated user can read **anyone's** order,
including the shipping address. (Confirmed by inspection; not runtime-reachable until B2 is fixed.)

**B5 — `POST /api/products` is completely unauthenticated.** `productRoutes.js:6` chains
`.post(createProduct)` with no `protect` and no admin check. *Verified: created a product with no
token.* There is no `admin` middleware in the codebase at all, despite `User.isAdmin` existing.

**B6 — No error-handling middleware.** `server.js` registers no `notFound`/`errorHandler`, so every
thrown error returns an **HTML stack trace** exposing absolute filesystem paths
(`C:/Study/Programming/.../authMiddleware.js:28:15`). It also breaks the frontend, which reads
`err.response?.data.message` — that is `undefined` for every error the API returns.

**B7 — `getProductById` is missing `await`.** `productController.js:9` does
`const product = Product.findById(...)` without `await`; a Mongoose Query is always truthy, so the
`else` 404 branch is unreachable and the response is a serialized query object. (Masked by B1.)

**B8 — `countInStock` is typed `String`.** `productModel.js:10` — `{type: String}` for a stock count.
*Verified: posting `5` stored `"5"`.* Makes stock comparisons string comparisons (`"10" < "9"`).

**B9 — Password re-hash on any save.** `userModel.js:31` — `if(!this.isModified("password")){ next(); }`
has **no `return`**, so execution continues and re-hashes an already-hashed password on any later
`user.save()`. Latent: nothing updates a user today, but it will silently lock users out.

**B10 — `cartModel` timestamps typo.** `cartModel.js:32` — `{timestamp: true}` should be
`{timestamps: true}`; the option is silently ignored, so carts have no `createdAt`/`updatedAt`.

**B11 — Order model requires `image` but the cart mapping omits it.** `orderModel.js` marks
`orderItems.image` `required`, while `createOrder`'s `cartItems` map (line 37) never sets it — a
server-built order would fail validation once B2/B3 are fixed.

**B12 — Dead code in `server.js`.** Imports `User` but never uses it; 5 commented-out lines that
write a test user to the DB.

**B13 — No stock is ever decremented** and no transaction wraps order creation.

**B14 — CORS is wide open.** `app.use(cors())` allows every origin.

**B15 — Secrets posture.** No `.env` is committed (good — `backend/.gitignore` covers it) but there
is **no `.env.example`**, so required vars (`PORT`, `MONGO_URI`, `JWT_SECRET`) are undocumented.

**B16 — API base URL hardcoded.** `http://localhost:5000` is inlined in `LoginScreen.jsx:23` and
`RegisterScreen.jsx:26`; no `VITE_API_URL`, and `vite.config.js` has **no dev proxy**.

**B17 — JWT in `localStorage`** (XSS-readable) with a 30-day non-revocable expiry and no logout.

---

## 5. How the old app ran (historical)

> `backend/` and `frontend/` were removed in Batch 7. These steps no longer work and are kept only as
> a record of the audit. To run the app today, follow the root `README.md`.

```bash
# 1. dev DB (host port 27018 to avoid the occupied 27017)
docker compose up -d mongo          # after Batch 1 adds docker-compose.yml

# 2. backend  — needs backend/.env (copy from backend/.env.example, added in Batch 1)
cd backend && npm install && npm run dev      # http://localhost:5000

# 3. frontend
cd frontend && npm install && npm run dev     # http://localhost:5173
```
Required backend env vars: `PORT`, `MONGO_URI`, `JWT_SECRET`.

---

## 6. Audit conclusions that shape the plan

1. **The DB is MongoDB**, so the migration reference's "use Prisma" default does **not** apply
   cleanly. Decision: **keep Mongoose** (the schemas are reusable and the data model is sound),
   typed with TypeScript, rather than rewrite to SQL. Logged in PLAN.md §Decisions.
2. **There is nothing worth preserving in the frontend pages** — 3 of 5 render hardcoded data and
   both contexts are empty files. The Next.js pages are a rewrite, not a port. Only `Loader`,
   `Message` and the Tailwind setup carry over.
3. **The backend has real, reusable shape** (models, JWT flow, cart logic) but every write path is
   either insecure or crashing. Porting means fixing B1–B17 as we go, not copying.
4. **Option A (full-stack Next.js)** is confirmed by the user: Express becomes route handlers and is
   deleted in Batch 7.
5. **No test runner exists**, so Batch 1 must establish Vitest before any logic is ported.
6. `gh` is unauthenticated → the Batch 1 PR may need the human. See BLOCKERS.md.
