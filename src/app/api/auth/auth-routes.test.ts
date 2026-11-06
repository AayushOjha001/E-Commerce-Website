import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearDatabase,
  dbReachable,
  requireDb,
  setupTestDatabase,
  teardownTestDatabase,
} from "@/test/db";

// Hoisted: the mock must be in place before the route modules import
// `next/headers`, which only exists inside a real request scope. The factory is
// async so it can use a dynamic import — `require` does not resolve the `@/`
// alias inside a hoisted block.
const jar = await vi.hoisted(async () => {
  const { createCookieJar } = await import("@/test/cookie-jar");
  return createCookieJar();
});

vi.mock("next/headers", () => ({
  cookies: async () => jar.cookieStore,
}));

const { POST: register } = await import("@/app/api/auth/register/route");
const { POST: login } = await import("@/app/api/auth/login/route");
const { POST: logout } = await import("@/app/api/auth/logout/route");
const { GET: getProfile, PATCH: patchProfile } = await import(
  "@/app/api/users/profile/route"
);
const { SESSION_COOKIE } = await import("@/server/auth/session");
const { verifySessionToken, SESSION_MAX_AGE_SECONDS } = await import(
  "@/server/auth/tokens"
);
const { UserModel } = await import("@/server/models");

function jsonRequest(body: unknown, url = "http://localhost/api"): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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

describe.skipIf(!dbReachable)("auth route handlers", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);

  beforeEach(async () => {
    await clearDatabase();
    jar.clear();
  });

  describe("POST /api/auth/register", () => {
    it("creates a user, returns 201 and signs them in", async () => {
      const response = await register(jsonRequest(VALID));
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.user).toMatchObject({
        email: "ada@example.com",
        role: "customer",
      });

      const cookie = jar.raw(SESSION_COOKIE);
      expect(cookie).toBeDefined();
      expect(verifySessionToken(cookie!.value)).toMatchObject({
        role: "customer",
      });
    });

    it("sets the session cookie httpOnly, so XSS cannot read it (audit B17)", async () => {
      await register(jsonRequest(VALID));

      const cookie = jar.raw(SESSION_COOKIE)!;
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe("lax");
      expect(cookie.path).toBe("/");
      // Bounded lifetime, and never sent over plaintext in production.
      expect(cookie.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
      expect(cookie.secure).toBe(process.env.NODE_ENV === "production");
    });

    it("scopes the session cookie to 7 days, not the legacy 30 (audit B17)", async () => {
      await register(jsonRequest(VALID));

      expect(jar.raw(SESSION_COOKIE)!.maxAge).toBe(7 * 24 * 60 * 60);
    });

    it("never returns the token or the password in the body", async () => {
      const response = await register(jsonRequest(VALID));
      const text = await response.text();

      // The legacy endpoint returned `token` in JSON for localStorage.
      expect(text).not.toMatch(/token/i);
      expect(text).not.toMatch(/password/i);
      expect(text).not.toMatch(VALID.password);
    });

    it("rejects a duplicate email with 409", async () => {
      await register(jsonRequest(VALID));
      const response = await register(jsonRequest(VALID));

      expect(response.status).toBe(409);
      expect((await response.json()).message).toMatch(/already exists/i);
    });

    it("rejects invalid input with 400 and per-field details", async () => {
      const response = await register(
        jsonRequest({ name: "", email: "nope", password: "short" }),
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(Object.keys(body.details)).toEqual(
        expect.arrayContaining(["name", "email", "password"]),
      );
    });

    it("cannot self-elevate by sending a role", async () => {
      const response = await register(
        jsonRequest({ ...VALID, role: "admin" }),
      );

      expect((await response.json()).user.role).toBe("customer");
      const stored = await UserModel.findOne({ email: VALID.email });
      expect(stored!.role).toBe("customer");
    });

    it("rejects a malformed JSON body with 400, not 500", async () => {
      const bad = new Request("http://localhost/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      });

      const response = await register(bad);
      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      await register(jsonRequest(VALID));
      jar.clear();
    });

    it("signs in with correct credentials", async () => {
      const response = await login(
        jsonRequest({ email: VALID.email, password: VALID.password }),
      );

      expect(response.status).toBe(200);
      expect((await response.json()).user.email).toBe(VALID.email);
      expect(jar.raw(SESSION_COOKIE)).toBeDefined();
    });

    it("is case-insensitive on email", async () => {
      const response = await login(
        jsonRequest({ email: "ADA@EXAMPLE.COM", password: VALID.password }),
      );

      expect(response.status).toBe(200);
    });

    it("rejects a wrong password with 401 and sets no cookie", async () => {
      const response = await login(
        jsonRequest({ email: VALID.email, password: "wrong-password" }),
      );

      expect(response.status).toBe(401);
      expect(jar.raw(SESSION_COOKIE)).toBeUndefined();
    });

    it("gives the same answer for an unknown email as a wrong password", async () => {
      // Otherwise the endpoint is an account-enumeration oracle.
      const unknown = await login(
        jsonRequest({ email: "nobody@example.com", password: "whatever" }),
      );
      const wrong = await login(
        jsonRequest({ email: VALID.email, password: "wrong-password" }),
      );

      expect(unknown.status).toBe(wrong.status);
      expect(await unknown.json()).toEqual(await wrong.json());
    });

    it('uses correct spelling — the legacy typo was "credintials"', async () => {
      const response = await login(
        jsonRequest({ email: VALID.email, password: "wrong-password" }),
      );

      const { message } = await response.json();
      expect(message).toBe("Invalid email or password");
      expect(message).not.toMatch(/credintials/i);
    });

    it("rejects missing fields with 400", async () => {
      expect((await login(jsonRequest({}))).status).toBe(400);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("clears the session cookie", async () => {
      await register(jsonRequest(VALID));
      expect(jar.raw(SESSION_COOKIE)).toBeDefined();

      const response = await logout();

      expect(response.status).toBe(200);
      expect(jar.raw(SESSION_COOKIE)).toBeUndefined();
    });

    it("succeeds when not signed in, so it is safe to call blindly", async () => {
      expect((await logout()).status).toBe(200);
    });
  });

  describe("GET /api/users/profile", () => {
    it("returns the signed-in user", async () => {
      await register(jsonRequest(VALID));

      const response = await getProfile();

      expect(response.status).toBe(200);
      expect((await response.json()).user.email).toBe(VALID.email);
    });

    it("returns JSON 401 when signed out — never an HTML stack trace (audit B6)", async () => {
      const response = await getProfile();

      // 401 "who are you", distinct from 403 "signed in but not allowed".
      expect(response.status).toBe(401);
      expect(response.headers.get("content-type")).toMatch(/application\/json/);

      const text = await response.text();
      expect(text).not.toMatch(/<!DOCTYPE|<html/i);
      // The legacy handler leaked absolute paths like C:/Study/.../file.js:28.
      expect(text).not.toMatch(/\.ts:\d+|\.js:\d+/);
      expect(JSON.parse(text).message).toBeTruthy();
    });

    it("rejects a forged cookie", async () => {
      jar.seed(SESSION_COOKIE, "not.a.valid.jwt");

      expect((await getProfile()).status).toBe(401);
    });

    it("rejects a valid token for a user who no longer exists", async () => {
      await register(jsonRequest(VALID));
      await UserModel.deleteMany({});

      // The cookie is still perfectly valid; the account behind it is gone.
      expect((await getProfile()).status).toBe(401);
    });

    it("never exposes the password hash", async () => {
      await register(jsonRequest(VALID));

      const text = await (await getProfile()).text();

      expect(text).not.toMatch(/\$2[aby]\$/);
      expect(text).not.toMatch(/password/i);
    });
  });

  describe("PATCH /api/users/profile", () => {
    beforeEach(async () => {
      await register(jsonRequest(VALID));
    });

    it("updates the name", async () => {
      const response = await patchProfile(jsonRequest({ name: "Ada L." }));

      expect(response.status).toBe(200);
      expect((await response.json()).user.name).toBe("Ada L.");
    });

    it("changes the password and keeps login working", async () => {
      await patchProfile(jsonRequest({ password: "a-brand-new-password", currentPassword: VALID.password }));
      jar.clear();

      const ok = await login(
        jsonRequest({ email: VALID.email, password: "a-brand-new-password" }),
      );
      expect(ok.status).toBe(200);

      jar.clear();
      const old = await login(
        jsonRequest({ email: VALID.email, password: VALID.password }),
      );
      expect(old.status).toBe(401);
    });

    it("invalidates other sessions when the password changes", async () => {
      // Sessions are stateless JWTs, so without a password-change cutoff a
      // token stolen beforehand would outlive the very change meant to stop it.
      const stolen = jar.raw(SESSION_COOKIE)!.value;

      await patchProfile(jsonRequest({ password: "a-brand-new-password", currentPassword: VALID.password }));

      jar.clear();
      jar.seed(SESSION_COOKIE, stolen);
      expect((await getProfile()).status).toBe(401);
    });

    it("keeps the session that made the change signed in", async () => {
      // The cutoff must not sign out the very session that changed it.
      const response = await patchProfile(
        jsonRequest({ password: "a-brand-new-password", currentPassword: VALID.password }),
      );

      expect(response.status).toBe(200);
      expect((await getProfile()).status).toBe(200);
    });

    it("cannot elevate its own role", async () => {
      await patchProfile(jsonRequest({ name: "Ada", role: "admin" }));

      const stored = await UserModel.findOne({ email: VALID.email });
      expect(stored!.role).toBe("customer");
    });

    it("requires authentication", async () => {
      jar.clear();

      expect((await patchProfile(jsonRequest({ name: "X" }))).status).toBe(401);
    });

    it("rejects an empty update with 400", async () => {
      expect((await patchProfile(jsonRequest({}))).status).toBe(400);
    });

    it("rejects a duplicate email with 409", async () => {
      jar.clear();
      await register(
        jsonRequest({ ...VALID, email: "grace@example.com", name: "Grace" }),
      );

      const response = await patchProfile(
        jsonRequest({ email: VALID.email, currentPassword: VALID.password }),
      );

      expect(response.status).toBe(409);
    });

    it("refuses an email change without the current password", async () => {
      const response = await patchProfile(
        jsonRequest({ email: "stolen@example.com" }),
      );

      expect(response.status).toBe(403);
      const stored = await UserModel.findOne({ email: VALID.email });
      expect(stored).not.toBeNull();
    });

    it("refuses a password change with the wrong current password", async () => {
      const response = await patchProfile(
        jsonRequest({
          password: "a-brand-new-password",
          currentPassword: "not-the-password",
        }),
      );

      expect(response.status).toBe(403);
    });

    it("does not ask for a password to re-save the same email", async () => {
      const response = await patchProfile(
        jsonRequest({ email: VALID.email.toUpperCase() }),
      );

      expect(response.status).toBe(200);
    });
  });
});
