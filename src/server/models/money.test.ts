import { describe, expect, it } from "vitest";

import { fromCents, roundMoney, sumLineItems, toCents } from "./money";

describe("roundMoney", () => {
  it("rounds to 2 decimals", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(19.999)).toBe(20);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it("leaves already-rounded values alone", () => {
    expect(roundMoney(9.99)).toBe(9.99);
    expect(roundMoney(0)).toBe(0);
  });

  it("returns 0 for non-finite input rather than NaN", () => {
    expect(roundMoney(Number.NaN)).toBe(0);
    expect(roundMoney(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("toCents / fromCents", () => {
  it("round-trips", () => {
    expect(fromCents(toCents(19.99))).toBe(19.99);
    expect(fromCents(toCents(0.01))).toBe(0.01);
  });

  it("converts without float drift", () => {
    // 19.99 * 100 is 1998.9999999999998 in floating point.
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.29)).toBe(29);
  });
});

describe("sumLineItems", () => {
  it("totals price * qty", () => {
    expect(sumLineItems([{ price: 10, qty: 2 }, { price: 5.5, qty: 1 }])).toBe(
      25.5,
    );
  });

  it("is exact where naive float arithmetic is not", () => {
    // The legacy controller did `acc + item.price * item.qty` directly, which
    // yields 0.30000000000000004 here.
    const items = [
      { price: 0.1, qty: 1 },
      { price: 0.2, qty: 1 },
    ];

    expect(sumLineItems(items)).toBe(0.3);
    expect(items.reduce((a, i) => a + i.price * i.qty, 0)).not.toBe(0.3);
  });

  it("stays exact across many cents-level items", () => {
    const items = Array.from({ length: 100 }, () => ({ price: 0.07, qty: 3 }));

    expect(sumLineItems(items)).toBe(21);
  });

  it("returns 0 for no items", () => {
    expect(sumLineItems([])).toBe(0);
  });
});
