# E-Shop

A full-stack online shop built with Next.js, TypeScript and MongoDB. Customers can browse by
department, search, manage a cart, check out and track orders. Admins can manage products,
departments and orders.

Payments use a mock provider, so nothing is charged. See [Limitations](#limitations).

## Features

**For customers**

- Home page laid out as department shelves
- Catalog with search, department and price filters, sorting and pagination
- Product pages with stock levels, related products and structured data for search engines
- Cart with instant updates, and a meter showing how close the order is to free shipping
- Checkout that prefills the last address and retries declined payments
- Order history with progress, and cancelling of unpaid orders
- Account page for editing details and changing the password

**For admins**

- Overview of orders to ship, unpaid orders, revenue and low stock
- Product and department management. Products are withdrawn rather than deleted, so past orders
  keep their links
- Order handling, where status can only move along allowed steps and cancelling returns stock

**Under the hood**

- Totals are always rebuilt on the server, and an order is refused if the total differs from the
  one the customer saw
- Creating an order runs in a transaction, so two shoppers cannot buy the last unit
- Unpaid orders release their stock after 30 minutes
- Sessions use an httpOnly cookie, and changing a password signs out other devices
- Failed logins are rate limited

## Getting started

You need [Node.js](https://nodejs.org) 20.9 or newer, and
[Docker](https://www.docker.com/products/docker-desktop/) for the local database.

```bash
# 1. Start MongoDB, and wait until it reports healthy
docker compose up -d --wait mongo

# 2. Install dependencies
npm install

# 3. Create your local settings
cp .env.example .env.local
```

Generate a signing secret and paste it into `JWT_SECRET` in `.env.local`. The placeholder is
rejected on purpose.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```bash
# 4. Load the demo catalog
npm run seed

# 5. Start the app
npm run dev
```

Open <http://localhost:3000>. If port 3000 is taken, Next.js picks another and prints it.

### Demo accounts

| Email | Password | Role |
|---|---|---|
| `admin@example.com` | `Password123!` | Admin, with access to `/admin` |
| `customer@example.com` | `Password123!` | Customer |

These are local development credentials. The seed refuses to run in production unless you set
`ALLOW_PRODUCTION_SEED=1`, because it creates accounts with a published password.

To try a declined payment, choose "Test payment that is declined" at checkout.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm start` | Serve the production build |
| `npm test` | Run the tests once |
| `npm run test:watch` | Run the tests in watch mode |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Check types |
| `npm run seed` | Load the demo catalog. Safe to run repeatedly |
| `npm run seed -- --reset` | Also clear all carts and orders |

Tests that need the database skip themselves when it is unreachable, so `npm test` works on a fresh
clone. Set `REQUIRE_DB=1` to treat an unreachable database as a failure. CI does this.

```bash
REQUIRE_DB=1 npm test
```

Tests run against a separate `_test` database, so they never touch your seeded data.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string. The database must be a replica set, see below |
| `JWT_SECRET` | Yes | At least 32 characters. Signs session cookies |
| `SITE_URL` | In production | Public address of the site, used for absolute URLs in social cards and search data |
| `SEED_PASSWORD` | No | Password for the demo accounts. Defaults to `Password123!` |

## Project layout

```
src/
  app/            Pages and API routes
    api/          JSON API
    admin/        Admin area
  components/     React components
  lib/            Code shared by the server and the browser
  server/
    services/     Business rules, used by both pages and API routes
    models/       Mongoose schemas
    auth/         Sessions, login and its rate limit
    payments/     Payment provider interface and the mock
    shop/         Server actions for the cart and checkout
    admin/        Server actions for the admin area
    db/           Connection and seed
  proxy.ts        Redirects signed-out visitors away from private pages
public/images/    Product drawings
docs/agent/       Audit, plan, design direction and progress log
```

Business rules live in `src/server/services`, so a page and an API route share one implementation.
Before changing the UI, read [docs/agent/DESIGN.md](docs/agent/DESIGN.md).

## API

All routes return JSON. Errors have the shape `{ "message": "..." }`.

| Method | Route | Access |
|---|---|---|
| GET | `/api/health` | Public |
| GET | `/api/products`, `/api/products/[id]`, `/api/categories` | Public |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Public |
| GET, PATCH | `/api/users/profile` | Signed in |
| GET, POST | `/api/cart` | Signed in |
| PATCH, DELETE | `/api/cart/[productId]` | Signed in |
| GET, POST | `/api/orders` | Signed in |
| GET | `/api/orders/[id]` | Owner or admin |
| POST | `/api/orders/[id]/pay`, `/api/orders/[id]/cancel` | Owner |
| GET, POST | `/api/admin/products`, `/api/admin/categories` | Admin |
| PATCH, DELETE | `/api/admin/products/[id]`, `/api/admin/categories/[id]` | Admin |
| GET | `/api/admin/orders` | Admin |
| PATCH | `/api/admin/orders/[id]` | Admin |

`GET /api/products` accepts `page`, `limit`, `search`, `category`, `minPrice`, `maxPrice` and `sort`
(`newest`, `price-asc`, `price-desc`, `rating`, `relevance`).

## Deployment

The database must be a **replica set**, because order creation uses transactions. MongoDB Atlas
clusters already are, including the free tier. A standalone `mongod` will not work.

Whichever host you use, set `MONGODB_URI`, `JWT_SECRET` and `SITE_URL`, and do not run the seed in
production.

**Vercel:** import the repository and add the variables. No other setup is needed.

**Your own server:**

```bash
npm ci
npm run build
npm start
```

Run it behind a reverse proxy that handles HTTPS and sets `X-Forwarded-For` itself. Session cookies
require HTTPS in production, and the login rate limit reads that header.

## Limitations

- **Payments are mocked.** To take real payments, implement the `PaymentProvider` interface in
  `src/server/payments/provider.ts`. Refunds are not implemented: cancelling a paid order only
  records it as refunded.
- **No password reset,** because the app does not send email.
- **No guest checkout.** Customers need an account to use the cart.
- **Saved addresses** are limited to prefilling from the last order.
- **Ratings are seeded.** There is no way to write a review yet.
- **Unpaid orders are released on activity, not on a timer.** The check runs before each checkout and
  when the admin overview loads, so a quiet shop may show stock as sold for longer than 30 minutes.
- **The login rate limit lives in memory,** so it applies per process and resets on restart. Running
  several instances needs a shared store such as Redis.
- **The Content Security Policy does not restrict scripts,** which would need a per-request nonce.
