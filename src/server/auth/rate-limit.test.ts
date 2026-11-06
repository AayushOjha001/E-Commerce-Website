import { beforeEach, describe, expect, it } from "vitest";

import {
  assertLoginAllowed,
  clientIp,
  recordLoginFailure,
  recordLoginSuccess,
  resetLoginLimits,
} from "./rate-limit";

const EMAIL = "ada@example.com";
const IP = "203.0.113.5";

function fail(times: number, ip = IP, email = EMAIL, now = Date.now()) {
  for (let count = 0; count < times; count += 1) {
    recordLoginFailure(email, ip, now);
  }
}

describe("login rate limit", () => {
  beforeEach(resetLoginLimits);

  it("allows attempts under the limit", () => {
    fail(9);

    expect(() => assertLoginAllowed(EMAIL, IP)).not.toThrow();
  });

  it("blocks after ten failures from one client", () => {
    fail(10);

    expect(() => assertLoginAllowed(EMAIL, IP)).toThrow(
      expect.objectContaining({ code: "rate_limited" }),
    );
  });

  it("does not lock the account out for a different client", () => {
    fail(10);

    expect(() => assertLoginAllowed(EMAIL, "198.51.100.9")).not.toThrow();
  });

  it("still stops a guesser who changes IP every time", () => {
    for (let count = 0; count < 50; count += 1) {
      fail(1, `10.0.0.${count}`);
    }

    expect(() => assertLoginAllowed(EMAIL, "10.1.1.1")).toThrow();
  });

  it("treats email case as the same account", () => {
    fail(10, IP, "ADA@example.com");

    expect(() => assertLoginAllowed(EMAIL, IP)).toThrow();
  });

  it("expires after the window", () => {
    const start = Date.now();
    fail(10, IP, EMAIL, start);

    expect(() =>
      assertLoginAllowed(EMAIL, IP, start + 16 * 60 * 1000),
    ).not.toThrow();
  });

  it("does not extend the window with further failures", () => {
    const start = Date.now();
    fail(9, IP, EMAIL, start);
    fail(1, IP, EMAIL, start + 14 * 60 * 1000);

    expect(() =>
      assertLoginAllowed(EMAIL, IP, start + 16 * 60 * 1000),
    ).not.toThrow();
  });

  it("clears the client counter on success", () => {
    fail(9);
    recordLoginSuccess(EMAIL, IP);
    fail(9);

    expect(() => assertLoginAllowed(EMAIL, IP)).not.toThrow();
  });
});

describe("clientIp", () => {
  it("takes the first forwarded address", () => {
    expect(
      clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })),
    ).toBe("203.0.113.5");
  });

  it("copes with no header", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
