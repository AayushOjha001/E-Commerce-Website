import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearDatabase,
  dbReachable,
  requireDb,
  setupTestDatabase,
  teardownTestDatabase,
} from "@/test/db";

const jar = await vi.hoisted(async () => {
  const { createCookieJar } = await import("@/test/cookie-jar");
  return createCookieJar();
});

vi.mock("next/headers", () => ({
  cookies: async () => jar.cookieStore,
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.5" }),
}));

/**
 * `redirect()` signals by throwing a special error that Next catches. Here it
 * throws a recognisable marker instead, so a test can assert *where* the action
 * navigated — and so a successful action does not look like a failure.
 */
class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`REDIRECT:${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
}));

const { loginAction, registerAction, logoutAction } = await import(
  "@/server/auth/actions"
);
const { SESSION_COOKIE } = await import("@/server/auth/session");
const { verifySessionToken } = await import("@/server/auth/tokens");
const { UserModel } = await import("@/server/models");

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** Runs an action, returning either its state or the path it redirected to. */
async function run(
  action: (state: object, data: FormData) => Promise<unknown>,
  fields: Record<string, string>,
): Promise<{ redirectedTo?: string; state?: Record<string, unknown> }> {
  try {
    const state = (await action({}, formData(fields))) as Record<string, unknown>;
    return { state };
  } catch (error) {
    if (error instanceof RedirectSignal) return { redirectedTo: error.to };
    throw error;
  }
}

const VALID = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "correct-horse-battery",
};

describe("database availability", () => {
  it.runIf(requireDb)("is reachable, because REQUIRE_DB=1", () => {
    expect(dbReachable).toBe(true);
  });
});

describe.skipIf(!dbReachable)("auth server actions", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);

  beforeEach(async () => {
    await clearDatabase();
    jar.clear();
  });

  describe("registerAction", () => {
    it("creates the account, signs in and redirects home", async () => {
      const result = await run(registerAction, VALID);

      expect(result.redirectedTo).toBe("/");
      expect(jar.raw(SESSION_COOKIE)?.httpOnly).toBe(true);
      await expect(UserModel.countDocuments()).resolves.toBe(1);
    });

    it("honours a safe ?next destination", async () => {
      const result = await run(registerAction, { ...VALID, next: "/checkout" });

      expect(result.redirectedTo).toBe("/checkout");
    });

    it("refuses to redirect off-site", async () => {
      const result = await run(registerAction, {
        ...VALID,
        next: "https://evil.example",
      });

      expect(result.redirectedTo).toBe("/");
    });

    it("returns field errors and keeps what was typed", async () => {
      const result = await run(registerAction, {
        name: "Ada",
        email: "not-an-email",
        password: "short",
      });

      expect(result.redirectedTo).toBeUndefined();
      expect(result.state?.fieldErrors).toMatchObject({
        email: expect.any(String),
        password: expect.any(String),
      });
      // The form must not clear itself on a failed submit.
      expect(result.state?.values).toMatchObject({ name: "Ada" });
      // Never echo the password back into the HTML.
      expect(JSON.stringify(result.state)).not.toMatch(/short/);
    });

    it("reports a duplicate email without signing anyone in", async () => {
      await run(registerAction, VALID);
      jar.clear();

      const result = await run(registerAction, VALID);

      expect(result.state?.error).toMatch(/already exists/i);
      expect(jar.raw(SESSION_COOKIE)).toBeUndefined();
    });
  });

  describe("loginAction", () => {
    beforeEach(async () => {
      await run(registerAction, VALID);
      jar.clear();
    });

    it("signs in and redirects", async () => {
      const result = await run(loginAction, {
        email: VALID.email,
        password: VALID.password,
      });

      expect(result.redirectedTo).toBe("/");
      expect(
        verifySessionToken(jar.raw(SESSION_COOKIE)!.value),
      ).toMatchObject({ role: "customer" });
    });

    it("sends the user back where they were headed", async () => {
      const result = await run(loginAction, {
        email: VALID.email,
        password: VALID.password,
        next: "/account",
      });

      expect(result.redirectedTo).toBe("/account");
    });

    it("rejects a wrong password without setting a cookie", async () => {
      const result = await run(loginAction, {
        email: VALID.email,
        password: "wrong-password",
      });

      expect(result.state?.error).toBe("Invalid email or password");
      expect(jar.raw(SESSION_COOKIE)).toBeUndefined();
    });

    it("answers identically for an unknown account", async () => {
      const unknown = await run(loginAction, {
        email: "nobody@example.com",
        password: "whatever",
      });
      const wrong = await run(loginAction, {
        email: VALID.email,
        password: "wrong-password",
      });

      expect(unknown.state?.error).toBe(wrong.state?.error);
    });

    it("never redirects off-site after a successful login", async () => {
      const result = await run(loginAction, {
        email: VALID.email,
        password: VALID.password,
        next: "//evil.example",
      });

      expect(result.redirectedTo).toBe("/");
    });
  });

  describe("logoutAction", () => {
    it("clears the cookie and redirects home", async () => {
      await run(registerAction, VALID);
      expect(jar.raw(SESSION_COOKIE)).toBeDefined();

      let redirectedTo: string | undefined;
      try {
        await logoutAction();
      } catch (error) {
        if (error instanceof RedirectSignal) redirectedTo = error.to;
        else throw error;
      }

      expect(redirectedTo).toBe("/");
      expect(jar.raw(SESSION_COOKIE)).toBeUndefined();
    });
  });
});
