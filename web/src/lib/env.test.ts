import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import { env, EnvValidationError, parseEnv, resetEnvCache } from "@/lib/env";

const validEnv: Record<string, string | undefined> = {
  MONGODB_URI: "mongodb://localhost:27018/ecommerce_test",
  JWT_SECRET: "a".repeat(32),
  NODE_ENV: "test",
};

/** `validEnv` minus the named keys, for testing "missing variable" paths. */
function envWithout(...keys: string[]): Record<string, string | undefined> {
  const copy = { ...validEnv };
  for (const key of keys) delete copy[key];
  return copy;
}

describe("parseEnv", () => {
  it("accepts a valid environment", () => {
    const parsed = parseEnv(validEnv);

    expect(parsed.MONGODB_URI).toBe(validEnv.MONGODB_URI);
    expect(parsed.NODE_ENV).toBe("test");
  });

  it("defaults NODE_ENV to development when unset", () => {
    expect(parseEnv(envWithout("NODE_ENV")).NODE_ENV).toBe("development");
  });

  it("throws EnvValidationError, so callers can tell config from runtime faults", () => {
    expect(() => parseEnv({})).toThrow(EnvValidationError);
  });

  it("rejects a missing MONGODB_URI", () => {
    expect(() => parseEnv(envWithout("MONGODB_URI"))).toThrow(/MONGODB_URI/);
  });

  it("rejects a MONGODB_URI with the wrong scheme", () => {
    expect(() =>
      parseEnv({ ...validEnv, MONGODB_URI: "postgres://localhost:5432/db" }),
    ).toThrow(/must start with mongodb/);
  });

  it("rejects a MONGODB_URI with no host", () => {
    expect(() => parseEnv({ ...validEnv, MONGODB_URI: "mongodb://" })).toThrow(
      /must include a host/,
    );
  });

  it("accepts a mongodb+srv URI", () => {
    expect(
      parseEnv({ ...validEnv, MONGODB_URI: "mongodb+srv://host/db" })
        .MONGODB_URI,
    ).toBe("mongodb+srv://host/db");
  });

  it("rejects a JWT_SECRET shorter than 32 characters", () => {
    expect(() => parseEnv({ ...validEnv, JWT_SECRET: "too-short" })).toThrow(
      /at least 32 characters/,
    );
  });

  it("rejects a JWT_SECRET still set to the .env.example placeholder", () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        JWT_SECRET: "replace_me_with_a_long_random_value_at_least_32_chars",
      }),
    ).toThrow(/still the placeholder/);
  });

  it("fails closed on .env.example's literal values, so copying it cannot boot", () => {
    // Guards against the example drifting into something that validates: a
    // committed signing secret is not a secret.
    const example = readFileSync(".env.example", "utf8");
    const parsed = Object.fromEntries(
      example
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.trim().startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
        }),
    );

    expect(parsed.JWT_SECRET).toBeTruthy();
    expect(() => parseEnv(parsed)).toThrow(EnvValidationError);
  });

  it("reports every problem at once rather than only the first", () => {
    let message = "";
    try {
      parseEnv({ JWT_SECRET: "short" });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/MONGODB_URI/);
    expect(message).toMatch(/JWT_SECRET/);
  });

  it("points the reader at .env.example", () => {
    expect(() => parseEnv({})).toThrow(/\.env\.example/);
  });
});

describe("env", () => {
  afterEach(() => {
    resetEnvCache();
  });

  it("parses process.env and memoises the result", () => {
    // setup.ts guarantees these are present.
    const first = env();
    const second = env();

    expect(second).toBe(first);
  });

  it("re-reads process.env after resetEnvCache", () => {
    const first = env();
    resetEnvCache();

    expect(env()).not.toBe(first);
    expect(env()).toEqual(first);
  });
});
