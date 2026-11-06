import { z } from "zod";

/**
 * Prefix used by the placeholder values in `.env.example`.
 *
 * Copying the example verbatim must not produce a bootable app: a signing
 * secret that is committed to the repository is not a secret.
 */
const PLACEHOLDER_PREFIX = "replace_me";

/** Rejects a value that is still the shipped placeholder. */
const notPlaceholder = (field: string) =>
  z.string().refine(
    (value) => !value.toLowerCase().startsWith(PLACEHOLDER_PREFIX),
    `${field} is still the placeholder from .env.example — generate a real value`,
  );

/**
 * Server-side environment schema.
 *
 * Every variable here is server-only and must never be prefixed with
 * `NEXT_PUBLIC_`, or Next.js would inline it into the client bundle.
 */
const envSchema = z.object({
  MONGODB_URI: z
    .string()
    .min(1, "MONGODB_URI is required")
    .refine(
      (value) =>
        value.startsWith("mongodb://") || value.startsWith("mongodb+srv://"),
      "MONGODB_URI must start with mongodb:// or mongodb+srv://",
    )
    // A prefix check alone accepts "mongodb://", which fails much later as an
    // opaque driver error. Require an actual host.
    .refine((value) => {
      try {
        return new URL(value).hostname.length > 0;
      } catch {
        return false;
      }
    }, "MONGODB_URI must include a host, e.g. mongodb://localhost:27018/ecommerce_dev"),
  // 32 chars is the floor for an HS256 signing secret to be worth anything.
  JWT_SECRET: notPlaceholder("JWT_SECRET").pipe(
    z.string().min(32, "JWT_SECRET must be at least 32 characters long"),
  ),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

/** Thrown when the environment is invalid, so callers can tell config errors
 * apart from downstream failures such as an unreachable database. */
export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

/**
 * Parses and validates environment variables, throwing a readable aggregate
 * error listing every problem at once rather than failing one at a time.
 *
 * Exported separately from the cached `env()` accessor so tests can validate
 * arbitrary input without touching `process.env`.
 */
export function parseEnv(
  // Deliberately looser than NodeJS.ProcessEnv, which Next.js augments to make
  // NODE_ENV a required readonly property. A validator must be able to take a
  // partial object and report what is missing.
  source: Record<string, string | undefined> = process.env,
): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new EnvValidationError(
      `Invalid environment variables:\n${details}\n\n` +
        "Copy web/.env.example to web/.env.local and fill in the values.",
    );
  }

  return result.data;
}

let cached: Env | undefined;

/**
 * Validated environment, parsed once per process.
 *
 * This is a function rather than a module-level constant on purpose: a
 * top-level `parseEnv()` would run at import time and crash commands that never
 * touch the database, such as `next build` collecting page data or a unit test
 * importing an unrelated module.
 */
export function env(): Env {
  cached ??= parseEnv();
  return cached;
}

/** Test-only: clears the memoised value so a new `env()` call re-reads. */
export function resetEnvCache(): void {
  cached = undefined;
}
