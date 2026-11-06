import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import {
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  verifySessionToken,
} from "./tokens";

const SECRET = process.env.JWT_SECRET as string;

describe("session tokens", () => {
  it("round-trips claims", () => {
    const token = signSessionToken({ userId: "abc123", role: "customer", tokenVersion: 0 });

    expect(verifySessionToken(token)).toMatchObject({
      userId: "abc123",
      role: "customer",
    });
  });

  it("carries the admin role", () => {
    const token = signSessionToken({ userId: "abc123", role: "admin", tokenVersion: 0 });

    expect(verifySessionToken(token)?.role).toBe("admin");
  });

  it("rejects a token signed with a different secret", () => {
    const forged = jwt.sign({ role: "admin" }, "some-other-secret-value-here", {
      subject: "abc123",
    });

    expect(verifySessionToken(forged)).toBeNull();
  });

  it("rejects an expired token", () => {
    const expired = jwt.sign({ role: "customer" }, SECRET, {
      subject: "abc123",
      expiresIn: -10,
    });

    expect(verifySessionToken(expired)).toBeNull();
  });

  it('rejects an unsigned "alg: none" token', () => {
    const unsigned = jwt.sign({ role: "admin" }, "", {
      subject: "abc123",
      algorithm: "none",
    });

    expect(verifySessionToken(unsigned)).toBeNull();

    // Kept as a regression guard, but note it passes with or without the
    // `algorithms` pin: jsonwebtoken 9 refuses `alg: none` whenever a key is
    // supplied. The test below is what actually covers the pin.
  });

  it.each(["HS384", "HS512"] as const)(
    "rejects a %s token signed with the same secret",
    (algorithm) => {
      // This is what `algorithms: ["HS256"]` actually buys. A string secret is a
      // valid key for every HMAC variant, so without the pin jsonwebtoken
      // accepts all of them. Verified by mutation: removing the pin fails this
      // test and leaves every other token test green.
      const token = jwt.sign({ role: "admin", v: 0 }, SECRET, {
        subject: "abc123",
        algorithm,
      });

      expect(verifySessionToken(token)).toBeNull();
    },
  );

  it("rejects a token with an unknown role", () => {
    // Correctly signed, but claims a role the app does not have. Must fail
    // closed rather than pass a bogus role through to authorisation checks.
    const token = jwt.sign({ role: "superuser" }, SECRET, {
      subject: "abc123",
    });

    expect(verifySessionToken(token)).toBeNull();
  });

  it("rejects a token with no role", () => {
    const token = jwt.sign({}, SECRET, { subject: "abc123" });

    expect(verifySessionToken(token)).toBeNull();
  });

  it("rejects a token with no subject", () => {
    const token = jwt.sign({ role: "customer" }, SECRET);

    expect(verifySessionToken(token)).toBeNull();
  });

  it("rejects an empty subject", () => {
    const token = jwt.sign({ role: "customer", sub: "" }, SECRET);

    expect(verifySessionToken(token)).toBeNull();
  });

  it("returns null for garbage rather than throwing", () => {
    for (const value of ["", "not-a-jwt", "a.b.c", "null"]) {
      expect(verifySessionToken(value)).toBeNull();
    }
  });

  it("expires in 7 days, not the legacy 30 (audit B17)", () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(7 * 24 * 60 * 60);

    const token = signSessionToken({ userId: "abc123", role: "customer", tokenVersion: 0 });
    const decoded = jwt.decode(token) as { exp: number; iat: number };

    expect(decoded.exp - decoded.iat).toBe(SESSION_MAX_AGE_SECONDS);
  });

  it("round-trips the token version, which gates stale sessions", () => {
    const claims = verifySessionToken(
      signSessionToken({ userId: "abc123", role: "customer", tokenVersion: 7 }),
    );

    expect(claims?.tokenVersion).toBe(7);
  });

  it("rejects a token with no version, rather than defaulting it to 0", () => {
    // A token predating this scheme, or hand-made, must fail closed: defaulting
    // would let it pass the staleness check for a version-0 user.
    const token = jwt.sign({ role: "customer" }, SECRET, { subject: "abc123" });

    expect(verifySessionToken(token)).toBeNull();
  });

  it("rejects a non-integer or negative version", () => {
    for (const v of ["1", 1.5, -1, null]) {
      const token = jwt.sign({ role: "customer", v }, SECRET, {
        subject: "abc123",
      });
      expect(verifySessionToken(token)).toBeNull();
    }
  });

  it("does not put anything sensitive in the payload", () => {
    const token = signSessionToken({ userId: "abc123", role: "customer", tokenVersion: 0 });
    const decoded = jwt.decode(token) as Record<string, unknown>;

    // A JWT payload is only base64, readable by anyone holding the token.
    expect(Object.keys(decoded).sort()).toEqual([
      "exp",
      "iat",
      "role",
      "sub",
      "v",
    ]);
  });
});
