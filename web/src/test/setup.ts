import { config } from "dotenv";

// Pick up a developer's local overrides if present. `override: false` means
// anything already set in the real environment (e.g. CI) wins over the file.
config({ path: ".env.local", override: false, quiet: true });

// Test defaults live here, in one place, rather than in a committed .env.test —
// so `npm test` works on a fresh clone with no env files at all. Integration
// tests that need a live database skip themselves when it is unreachable.
// The test database name is deliberately distinct from the dev one.
// NODE_ENV is not set here: Vitest already sets it to "test", and Next.js types
// it as readonly so assigning to it does not typecheck.
process.env.MONGODB_URI ??= "mongodb://localhost:27018/ecommerce_test";
process.env.JWT_SECRET ??= "test_only_secret_not_used_in_any_real_environment";
