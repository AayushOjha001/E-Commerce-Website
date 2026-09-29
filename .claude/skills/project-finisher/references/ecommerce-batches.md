# Default batch order for e-commerce projects
Adapt to the audit. Skip tasks already working. Each line = one small task.

## Batch 1 — Foundation
- Project installs and builds cleanly; fix broken deps/scripts
- `.env.example` with all vars; config loader with validation
- Database connection (local via docker-compose if none exists); health endpoint checks DB
- Lint + formatter + test runner configured; one passing smoke test

## Batch 2 — Data layer
- Schema/models: User, Product, Category, Cart/CartItem, Order/OrderItem, Address
- Migrations + seed script with sample products
- Repository/service layer tests for core models

## Batch 3 — Auth
- Register, login, logout, refresh/session; hashed passwords
- Auth middleware; role (customer/admin)
- Tests for auth flows and protected routes

## Batch 4 — Catalog API
- Product list (pagination, search, filter by category, sort), product detail
- Admin CRUD for products/categories with validation
- Tests

## Batch 5 — Cart & Orders API
- Cart add/update/remove/get (per user), stock checks
- Checkout → order creation (transactional), order history, order detail
- Payment in test mode or mocked; order status updates
- Tests

## Batch 6 — Frontend wiring
- API client with auth handling and error handling
- Pages: home/catalog, product detail, cart, checkout, login/register, order history
- Loading/empty/error states; basic responsive layout

## Batch 7 — Admin & polish
- Admin pages: products, orders
- Input validation on forms, 404/500 pages

## Batch 8 — Ship-ready
- Full test pass, CI workflow (GitHub Actions: install, lint, test, build)
- README: setup, env, run, test, deploy notes
