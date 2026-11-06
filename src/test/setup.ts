import { config } from "dotenv";

// Pick up a developer's local overrides if present. `override: false` means
// anything already set in the real environment (e.g. CI) wins over the file.
config({ path: ".env.local", override: false, quiet: true });

// Test defaults live here, in one place, rather than in a committed .env.test —
// so `npm test` works on a fresh clone with no env files at all.
process.env.MONGODB_URI ??= "mongodb://localhost:27018/ecommerce_test";
process.env.JWT_SECRET ??= "test_only_secret_not_used_in_any_real_environment";
// NODE_ENV is not set here: Vitest already sets it to "test", and Next.js types
// it as readonly so assigning to it does not typecheck.

/**
 * Forces the connection onto a *test* database, whatever the URI says.
 *
 * This is not belt-and-braces. The suite truncates every collection between
 * tests, and `.env.local` legitimately points at the development database — so
 * without this rewrite, running `npm test` silently destroys the developer's
 * seeded catalog and demo accounts. The `??=` default above never fired for
 * anyone who had actually configured the app.
 *
 * Host, port and credentials are kept, so a custom local setup still works; only
 * the database name changes.
 */
function forceTestDatabaseName(uri: string): string {
  try {
    const url = new URL(uri);
    // pathname is "/dbname" (or "/" when unspecified).
    const current = url.pathname.replace(/^\//, "");
    const base = current.length > 0 ? current : "ecommerce";

    if (!base.endsWith("_test")) {
      url.pathname = `/${base}_test`;
    }
    return url.toString();
  } catch {
    // An unparseable URI is the env loader's problem to report, not ours.
    return uri;
  }
}

process.env.MONGODB_URI = forceTestDatabaseName(process.env.MONGODB_URI);
