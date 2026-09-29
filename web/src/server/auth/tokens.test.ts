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
    const token = signSessionToken({ userId: "abc123", role: "customer" });

    expect(verifySessionToken(token)).toEqual({
      userId: "abc123",
      role: "customer",
    });
  });

  it("carries the admin role", () => {
    const token = signSessionToken({ userId: "abc123", role: "admin" });

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
    // The classic JWT confusion attack: without pinning algorithms, a token
    // that declares it needs no signature would verify.
    const unsigned = jwt.sign({ role: "admin" }, "", {
      subject: "abc123",
      algorithm: "none",
    });

    expect(verifySessionToken(unsigned)).toBeNull();
  });

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

    const token = signSessionToken({ userId: "abc123", role: "customer" });
    const decoded = jwt.decode(token) as { exp: number; iat: number };

    expect(decoded.exp - decoded.iat).toBe(SESSION_MAX_AGE_SECONDS);
  });

  it("does not put anything sensitive in the payload", () => {
    const token = signSessionToken({ userId: "abc123", role: "customer" });
    const decoded = jwt.decode(token) as Record<string, unknown>;

    // A JWT payload is only base64, readable by anyone holding the token.
    expect(Object.keys(decoded).sort()).toEqual(["exp", "iat", "role", "sub"]);
  });
});
