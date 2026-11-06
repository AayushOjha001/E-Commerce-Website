import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { clearDatabase, dbReachable, setupTestDatabase, teardownTestDatabase } from "@/test/db";

const jar = await vi.hoisted(async () => {
  const { createCookieJar } = await import("@/test/cookie-jar");
  return createCookieJar();
});

vi.mock("next/headers", () => ({ cookies: async () => jar.cookieStore }));

const { POST: login } = await import("./login/route");
const { resetLoginLimits } = await import("@/server/auth/rate-limit");
const { UserModel } = await import("@/server/models");

const EMAIL = "ada@example.com";
const PASSWORD = "correct-horse-battery";

function attempt(password: string, ip = "203.0.113.5"): Promise<Response> {
  return login(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email: EMAIL, password }),
    }),
  );
}

describe.skipIf(!dbReachable)("login rate limit through the route", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);

  beforeEach(async () => {
    await clearDatabase();
    resetLoginLimits();
    await UserModel.create({ name: "Ada", email: EMAIL, password: PASSWORD });
  });

  it("answers 429 after ten failures, even for the right password", async () => {
    for (let count = 0; count < 10; count += 1) {
      expect((await attempt("wrong-password")).status).toBe(401);
    }

    const response = await attempt(PASSWORD);

    expect(response.status).toBe(429);
    expect((await response.json()).message).toContain("Too many");
  });

  it("does not lock out the real user on another connection", async () => {
    for (let count = 0; count < 10; count += 1) {
      await attempt("wrong-password");
    }

    expect((await attempt(PASSWORD, "198.51.100.9")).status).toBe(200);
  });

  it("does not count successful logins", async () => {
    for (let count = 0; count < 12; count += 1) {
      expect((await attempt(PASSWORD)).status).toBe(200);
    }
  });
});
