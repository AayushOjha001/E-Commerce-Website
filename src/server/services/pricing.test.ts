import { describe, expect, it } from "vitest";

import {
  FREE_SHIPPING_THRESHOLD,
  SHIPPING_FLAT_RATE,
  TAX_RATE,
  calculateOrderTotals,
  qualifiesForFreeShipping,
} from "./pricing";

describe("calculateOrderTotals", () => {
  it("computes subtotal, tax, shipping and total", () => {
    // 2 x 19.99 = 39.98, under the free-shipping threshold.
    const totals = calculateOrderTotals([{ price: 19.99, qty: 2 }]);

    expect(totals.itemsPrice).toBe(39.98);
    expect(totals.taxPrice).toBe(5.2); // round(3998 * 0.13) = 520 cents
    expect(totals.shippingPrice).toBe(SHIPPING_FLAT_RATE);
    expect(totals.totalPrice).toBe(55.17);
  });

  it("waives shipping at or above the threshold", () => {
    const atThreshold = calculateOrderTotals([
      { price: FREE_SHIPPING_THRESHOLD, qty: 1 },
    ]);
    expect(atThreshold.shippingPrice).toBe(0);

    const justUnder = calculateOrderTotals([
      { price: FREE_SHIPPING_THRESHOLD - 0.01, qty: 1 },
    ]);
    expect(justUnder.shippingPrice).toBe(SHIPPING_FLAT_RATE);
  });

  it("charges no shipping on an empty order", () => {
    expect(calculateOrderTotals([])).toEqual({
      itemsPrice: 0,
      taxPrice: 0,
      shippingPrice: 0,
      totalPrice: 0,
    });
  });

  it("totals exactly, where float arithmetic would drift", () => {
    // 3 x 0.1 as floats gives 0.30000000000000004.
    const totals = calculateOrderTotals([{ price: 0.1, qty: 3 }]);

    expect(totals.itemsPrice).toBe(0.3);
  });

  it("keeps total === items + tax + shipping to the cent", () => {
    const cases = [
      [{ price: 0.01, qty: 1 }],
      [{ price: 9.99, qty: 7 }],
      [{ price: 19.99, qty: 2 }, { price: 0.03, qty: 5 }],
      [{ price: 1149, qty: 1 }, { price: 249.99, qty: 3 }],
      [{ price: 33.33, qty: 3 }],
    ];

    for (const items of cases) {
      const t = calculateOrderTotals(items);
      const recomputed =
        Math.round((t.itemsPrice + t.taxPrice + t.shippingPrice) * 100) / 100;

      expect(t.totalPrice).toBe(recomputed);
    }
  });

  it("scales tax with quantity", () => {
    const one = calculateOrderTotals([{ price: 100, qty: 1 }]);
    const two = calculateOrderTotals([{ price: 100, qty: 2 }]);

    expect(one.taxPrice).toBe(Math.round(100 * TAX_RATE * 100) / 100);
    expect(two.taxPrice).toBe(Math.round(200 * TAX_RATE * 100) / 100);
  });

  it("sums multiple line items", () => {
    const totals = calculateOrderTotals([
      { price: 10, qty: 2 },
      { price: 5.5, qty: 4 },
    ]);

    expect(totals.itemsPrice).toBe(42);
  });
});

describe("qualifiesForFreeShipping", () => {
  it("is inclusive of the threshold", () => {
    expect(qualifiesForFreeShipping(FREE_SHIPPING_THRESHOLD)).toBe(true);
    expect(qualifiesForFreeShipping(FREE_SHIPPING_THRESHOLD - 0.01)).toBe(false);
    expect(qualifiesForFreeShipping(0)).toBe(false);
  });
});
