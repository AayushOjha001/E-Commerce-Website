import type { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";
import { SESSION_COOKIE } from "@/server/auth/session";
import { signSessionToken } from "@/server/auth/tokens";

/**
 * Builds a NextRequest-shaped object.
 *
 * Only `nextUrl`, `url` and `cookies.get` are used by the proxy, so a literal is
 * enough and avoids needing a live Next server.
 */
function request(path: string, token?: string): NextRequest {
  const url = new URL(path, "http://localhost:3000");

  return {
    nextUrl: url,
    url: url.toString(),
    cookies: {
      get: (name: string) =>
        name === SESSION_COOKIE && token ? { name, value: token } : undefined,
    },
  } as unknown as NextRequest;
}

const customerToken = signSessionToken({ userId: "u1", role: "customer" });
const adminToken = signSessionToken({ userId: "u2", role: "admin" });

describe("proxy (route protection)", () => {
  describe("signed out", () => {
    it.each(["/account", "/account/orders", "/checkout", "/admin"])(
      "redirects %s to /login",
      (path) => {
        const response = proxy(request(path));
        const location = new URL(response.headers.get("location")!);

        expect(response.status).toBe(307);
        expect(location.pathname).toBe("/login");
      },
    );

    it("round-trips the intended destination in ?next", () => {
      const response = proxy(request("/checkout?step=payment"));
      const location = new URL(response.headers.get("location")!);

      expect(location.searchParams.get("next")).toBe("/checkout?step=payment");
    });

    it("keeps ?next relative, so it cannot be an open redirect", () => {
      const response = proxy(request("/account"));
      const next = new URL(
        response.headers.get("location")!,
      ).searchParams.get("next")!;

      expect(next.startsWith("/")).toBe(true);
      expect(next).not.toMatch(/^https?:|^\/\//);
    });

    it("clears a cookie that failed verification", () => {
      const response = proxy(request("/account", "tampered.token.value"));

      // Otherwise the browser keeps resending a cookie that can never work.
      expect(response.headers.get("set-cookie")).toMatch(
        new RegExp(`${SESSION_COOKIE}=;|${SESSION_COOKIE}=deleted`),
      );
    });

    it("treats an expired or forged token as signed out", () => {
      const forged = signSessionToken({ userId: "u1", role: "admin" }).slice(
        0,
        -3,
      );
      const response = proxy(request("/admin", forged));

      expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
    });
  });

  describe("signed in as a customer", () => {
    it.each(["/account", "/checkout"])("allows %s", (path) => {
      const response = proxy(request(path, customerToken));

      expect(response.headers.get("location")).toBeNull();
      expect(response.status).toBe(200);
    });

    it("hides /admin behind a 404 rewrite rather than a 403", () => {
      // A 403 would confirm to a non-admin that the admin surface is there.
      const response = proxy(request("/admin", customerToken));

      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toMatch(/not-found/);
    });

    it("hides nested admin routes too", () => {
      const response = proxy(request("/admin/products/new", customerToken));

      expect(response.headers.get("x-middleware-rewrite")).toMatch(/not-found/);
    });
  });

  describe("signed in as an admin", () => {
    it.each(["/admin", "/admin/products", "/account", "/checkout"])(
      "allows %s",
      (path) => {
        const response = proxy(request(path, adminToken));

        expect(response.headers.get("location")).toBeNull();
        expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      },
    );
  });
});
