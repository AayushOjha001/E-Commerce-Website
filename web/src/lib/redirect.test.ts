import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "@/lib/redirect";

describe("safeRedirectPath", () => {
  it("allows a site-relative path", () => {
    expect(safeRedirectPath("/account")).toBe("/account");
    expect(safeRedirectPath("/checkout?step=payment")).toBe(
      "/checkout?step=payment",
    );
  });

  it("rejects an absolute URL, which would be an open redirect", () => {
    // ?next=https://evil.example would bounce a just-authenticated user off-site.
    for (const value of [
      "https://evil.example",
      "http://evil.example/path",
      "HTTPS://evil.example",
    ]) {
      expect(safeRedirectPath(value)).toBe("/");
    }
  });

  it("rejects a protocol-relative URL", () => {
    // "//evil.example" inherits the current scheme and is still off-site.
    expect(safeRedirectPath("//evil.example")).toBe("/");
    expect(safeRedirectPath("//evil.example/path")).toBe("/");
  });

  it("rejects backslashes, which some browsers normalise to slashes", () => {
    expect(safeRedirectPath("/\\evil.example")).toBe("/");
    expect(safeRedirectPath("\\\\evil.example")).toBe("/");
  });

  it("rejects a relative path with no leading slash", () => {
    expect(safeRedirectPath("account")).toBe("/");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/");
  });

  it("falls back for empty and non-string input", () => {
    for (const value of ["", null, undefined, 42, {}, []]) {
      expect(safeRedirectPath(value)).toBe("/");
    }
  });

  it("honours a custom fallback", () => {
    expect(safeRedirectPath("https://evil.example", "/account")).toBe("/account");
  });
});
