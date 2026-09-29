## Batch 2: Data layer

Builds the data layer for the Next.js app: typed models, indexes, a seed script, and the
service layer. **Targets `agent/batch-1-foundation`**, not `master`, because Batch 1 (#1) is
still open — merge #1 first and this will retarget cleanly.

The legacy `backend/` and `frontend/` are untouched and still run.

### This is where the audit's worst bugs actually get fixed

| Audit | Was | Now |
|---|---|---|
| **B2** | `POST /api/orders` always threw `ReferenceError: product is not defined` — **no order could ever be created** | Order creation works, in a transaction |
| **B3** | Stored `req.body.orderItems` including **client-supplied prices**; tax and shipping silently stayed `0` | All line items and all four totals rebuilt from the database, in integer cents |
| **B4** | `GET /api/orders/:id` had **no ownership check** — any user could read anyone's order and shipping address | Ownership enforced, with an admin override; unknown ids return `not_found` so ids cannot be probed |
| **B13** | Stock was **never decremented** | Decremented atomically, race-tested |
| **R9** | Adding the same product twice **overwrote** the quantity, discarding the first add | Increments, with a per-item cap |
| **R5** | `GET /api/products` did `find({})` and returned the whole catalog | Pagination, full-text search, category filter, price range, sort |
| **B8** | `countInStock` was typed `String`, so `"10" < "9"` was true | `Number`, integer-validated |
| **B9** | Password re-hashed on any later `save()`, silently locking the user out | Fixed, with a regression test |
| **B10** | `{ timestamp: true }` typo meant carts had no timestamps at all | Fixed |
| **B11** | `orderItems.image` was required but the code never set it | Snapshotted from the product |

### Unplanned but necessary: the dev DB is now a replica set

The compose file started a **standalone** mongod, which **rejects transactions**:

```
This MongoDB deployment does not support retryable writes.
```

That would have broken atomic order creation later. Found by probing rather than by failing, so
`docker-compose.yml` now runs a single-node replica set on 27018 (`MONGODB_URI` unchanged).
Commit `ff22238` explains the port mapping, which has to keep one address valid both inside the
container and on the host.

### What landed

- **T2.0** replica set — verified commit persists and rollback discards
- **T2.1/T2.2** typed models for User, Product, Category (new), Cart, Order, Address; `isAdmin` → `role`; unique indexes, a weighted product text index, compound indexes for the catalog
- **T2.3** `npm run seed` — idempotent, 5 categories, 12 products (one deliberately out of stock), 2 accounts, and 12 committed local SVGs replacing the dead `via.placeholder.com` images
- **T2.4** services: products, categories, users, pricing, cart, orders — pure functions over models, no `req`/`res`, so one service backs both a route handler and a server component

**222 tests**, all against a real database.

### Review

The `reviewer` subagent returned `CHANGES_REQUIRED` with **17 findings; all addressed** (commit
`60258fc`). It confirmed the stock decrement is genuinely race-free and the IDOR fix airtight,
then found four things worth the round trip:

1. **`NaN` bypassed the paging clamp completely.** It survives `Math.trunc`/`min`/`max`, and Mongo
   reads `.limit(NaN)` as *no limit* — so the clamp inverted into "return the whole collection",
   the exact opposite of its own docstring. A handler doing `Number(searchParams.get("limit"))`
   turns `?limit=abc` into precisely that.
2. **Price bounds reached Mongo unvalidated**, raising a raw `CastError` — not a `ServiceError`,
   so it would surface as a 500 with driver internals in it.
3. **The seed's production guard was dead code.** It keyed on `NODE_ENV === "production"`, but
   `tsx` sets no `NODE_ENV`, so for the documented `npm run seed` it *never fired*. The realistic
   accident was never a stray NODE_ENV — it was a `MONGODB_URI` pointing at a shared cluster,
   which would seed `admin@example.com` with a published password **and the admin role** into it.
   Now inspects the target host; verified it refuses a real `mongodb+srv://` URI.
4. **`createUser` accepted a `role`**, and is what registration will call in Batch 3 — a handler
   spreading a request body into it would have granted self-elevation. Split out
   `registerCustomer`, whose type cannot carry a role.

It also caught a **vacuous test of mine**: "combines search with a category filter" passed with the
category filter removed, because the search term alone already produced the expected count.

**Mutation-tested** the two security-critical paths — remove the ownership check and the IDOR test
fails; remove the atomic stock guard and two concurrent checkouts *both* succeed and oversell.

### How to test

```bash
docker compose up -d mongo    # now a single-node replica set; wait for "healthy"

cd web
npm install
cp .env.example .env.local    # generate a real JWT_SECRET; the placeholder is rejected
npm run seed                  # idempotent — run it as often as you like
REQUIRE_DB=1 npm test         # 222 passed
npm run lint && npm run typecheck && npm run build
```

Demo accounts: `admin@example.com` / `customer@example.com`, password `Password123!`
(local dev credentials, not secrets).

Try the guard: `MONGODB_URI="mongodb+srv://x@y.mongodb.net/shop" npm run seed` → refuses.

There is deliberately **no HTTP layer or UI yet** — route handlers are Batch 3-6. `/api/health`
is still the only endpoint.

### Notes

- **Mongoose is 9.10.2, not 8** as the plan first said (D12). `npm install mongoose` resolved to
  the current major and Batch 1 already shipped on it. Logged as a deviation per the skill's
  major-version rule. Four v9 behaviour changes bit during this batch and are documented in code:
  async pre-hooks take no `next`, `FilterQuery` → `QueryFilter`, `new: true` → `returnDocument`,
  and `.select()` returns a `ProjectedHydratedDocument`.
- **D14:** T2.4 overlapped with Batch 5's T5.1/T5.3/T5.4/T5.6 — both said "write the cart/order
  service". The logic landed once here; Batch 5 now wires it to route handlers and pages. The
  Batch 5 task text is updated to say so.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
