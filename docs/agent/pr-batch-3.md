## Batch 3: Auth

Ports the legacy JWT auth into Next.js and adds what the old app never had.
**Targets `agent/batch-2-data-layer`** — merge #1 and #2 first and this retargets cleanly.

The legacy `backend/` and `frontend/` still run, untouched.

### What this fixes from the audit

| Audit | Was | Now |
|---|---|---|
| **B17** | JWT in `localStorage`, readable by any XSS, 30-day life, no logout | `httpOnly` `SameSite=Lax` cookie, 7 days, real logout, and a password change kills other sessions |
| **B6** | No error middleware — every throw returned an **HTML stack trace with absolute paths** (`C:/Study/.../authMiddleware.js:28`), and the frontend read `.data.message`, always `undefined` | One helper maps everything to JSON `{message}`; unknown errors become a bare 500 with detail logged server-side only |
| **B5** | No admin check anywhere, despite `isAdmin` existing | `requireAdmin()` + `proxy.ts`; `/admin` returns **404, not 403**, so a non-admin cannot tell it exists |
| **R2/R3/R4** | No input validation; `req.body` passed straight to `User.create`; typo `"Invalid credintials"` | zod on every endpoint, correct spelling, and login cannot be used to enumerate accounts |
| **P4/P5** | Two screens hand-rolling the same axios call to a hardcoded `localhost:5000` | Server actions sharing the service layer; the browser never handles a token |
| **C1** | Navbar always showed "Login"/"Register", with no idea who was signed in | Server-component header, correct on first paint, Admin link for admins only |

### Notable Next 16 details

- Route protection lives in **`proxy.ts`**, not `middleware.ts` — renamed in v16, and its runtime is
  always `nodejs`, which is what lets it verify a JWT.
- The proxy is explicitly **a convenience, not the security boundary**: every handler and page checks
  independently, so a path the matcher misses is not thereby exposed.
- `typecheck` now runs `next typegen` first — `PageProps<"/login">` depends on generated route types,
  so a fresh clone failed to typecheck before its first build.

### Two bugs worth your attention

**1. The test suite had been wiping the development database** (commit `a72fb2f`). `src/test/setup.ts`
only supplied a test DB name with `??=`, and `.env.local` legitimately sets `MONGODB_URI` — so the
default never applied for anyone who had configured the app, and the suite truncated the dev data on
every run. Found the honest way: logging in as the seeded admin failed, because the test run before
it had deleted the account. Dates back to Batch 1.

**2. A valid token whose account no longer exists 500'd every protected page** (found in review). The
proxy admits the request, `requireUser()` throws, and nothing maps a `ServiceError` to a redirect in a
Server Component — so the error boundary renders a 500 rather than a login form. Reachable just by
reseeding, which gives users new ids while an existing cookie stays cryptographically valid. Guards are
now split: pages redirect, handlers throw.

### Review

`CHANGES_REQUIRED` with one reachable defect and several **demonstrated** coverage holes — the
reviewer proved each by mutation rather than by reading. All addressed (`a6aa613`). Beyond the 500
above:

- **My `alg: none` test proved nothing, and its comment was wrong.** jsonwebtoken 9 rejects that token
  with or without the `algorithms` pin — I confirmed it directly. What the pin actually buys is
  rejecting **HS384/HS512** signed with the same secret, which had no test at all.
- **`config.matcher` was asserted nowhere** — narrowing it to `["/account"]` left all 16 proxy tests
  green, because they call `proxy()` directly and bypass routing entirely.
- **Cookie `secure`/`maxAge` were asserted nowhere** — hardcoding `secure: false` left every
  auth-route test passing, so nothing stopped the session cookie going out over plaintext.
- **A password change did not end other sessions.** Added a `tokenVersion` counter — not a
  `passwordChangedAt` timestamp, because a JWT's `iat` is whole seconds and cannot separate a token
  minted just before a change from one just after in the same second.
- **`requireAdmin` had no tests**, though "non-admin blocked from admin" is a T3.6 exit criterion.
- **No component tests**, though the vitest config had promised a jsdom project "when components
  arrive in Batch 3". Added.

Also closed: 401 and 403 were conflated; login timing distinguished an unknown email from a wrong
password (now burns a dummy bcrypt compare); `?next=/login` looped.

Findings 1–4 were **mutation-tested** — each fix fails its test when reverted.

### How to test

```bash
docker compose up -d mongo
cd web && npm install
cp .env.example .env.local   # generate a real JWT_SECRET
npm run seed
REQUIRE_DB=1 npm test        # 353 passed, 21 files (server + jsdom projects)
npm run lint && npm run typecheck && npm run build
npm start
```

Then, signed out:

```bash
curl -i localhost:3000/account            # 307 -> /login?next=%2Faccount
curl -i localhost:3000/api/users/profile  # 401 JSON, never HTML
```

Sign in as `customer@example.com` / `Password123!` and `/admin` gives **404**; as
`admin@example.com` it does not. Change your password from one session and a cookie captured earlier
stops working, while the session that made the change keeps going.

### Still to come

`/cart`, `/checkout` and `/admin` have no pages yet — Batches 4–6. The proxy already guards them, so
they are protected the moment they exist.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
