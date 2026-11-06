/**
 * CLI entry point for `npm run seed`.
 *
 * Separate from seed.ts so the seed function stays importable by tests without
 * side effects, and so no fragile "am I the entry module?" check is needed
 * (comparing import.meta.url against argv[1] is awkward on Windows paths).
 *
 * Usage:
 *   npm run seed            # upsert catalog and users, leave carts/orders alone
 *   npm run seed -- --reset # also clear carts and orders
 */
import { config } from "dotenv";

import { disconnectDB } from "@/server/db/connect";
import { seed } from "@/server/db/seed";

// Static imports are safe despite loading env below: env() is lazy and is not
// called at import time, only once the seed opens a connection.
config({ path: ".env.local", override: false, quiet: true });

// Wrapped in a function rather than using top-level await: web/package.json has
// no "type": "module", so tsx compiles this as CJS, where TLA is unsupported.
async function main(): Promise<void> {
  try {
    const result = await seed({ reset: process.argv.includes("--reset") });
    console.log("Seed complete:", result);
    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error(
      "Seed failed:",
      error instanceof Error ? error.message : error,
    );
    await disconnectDB().catch(() => {});
    process.exit(1);
  }
}

void main();
