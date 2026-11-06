import { describe, expect, it } from "vitest";

import { applyCartChange } from "./cart-view";
import type { CartLine, CartView } from "@/server/services/cart";

const line = (overrides: Partial<CartLine>): CartLine => ({
  productId: "a",
  name: "A",
  slug: "a",
  image: "/a.svg",
  categorySlug: "audio",
  price: 0.1,
  qty: 1,
  lineTotal: 0.1,
  countInStock: 5,
  exceedsStock: false,
  ...overrides,
});

const CART: CartView = {
  items: [line({}), line({ productId: "b", price: 0.2, lineTotal: 0.2 })],
  subtotal: 0.3,
  itemCount: 2,
  hasIssues: false,
};

describe("applyCartChange", () => {
  it("updates the line and totals on a quantity change", () => {
    const next = applyCartChange(CART, { type: "qty", productId: "a", qty: 3 });

    expect(next.items[0]).toMatchObject({ qty: 3, lineTotal: 0.3 });
    expect(next.itemCount).toBe(4);
  });

  it("adds money in cents, so floats do not drift", () => {
    const next = applyCartChange(CART, { type: "qty", productId: "a", qty: 2 });

    // 0.1 * 2 + 0.2 as floats is 0.4 here, but 0.1 + 0.2 is the classic trap.
    expect(next.subtotal).toBe(0.4);
    expect(applyCartChange(CART, { type: "qty", productId: "b", qty: 1 }).subtotal).toBe(0.3);
  });

  it("removes a line", () => {
    const next = applyCartChange(CART, { type: "remove", productId: "a" });

    expect(next.items.map((item) => item.productId)).toEqual(["b"]);
    expect(next.subtotal).toBe(0.2);
  });

  it("clears the issue flag once the offending line is fixed", () => {
    const cart: CartView = {
      ...CART,
      items: [line({ qty: 9, exceedsStock: true })],
      hasIssues: true,
    };

    expect(
      applyCartChange(cart, { type: "qty", productId: "a", qty: 5 }).hasIssues,
    ).toBe(false);
  });

  it("does not modify the cart it was given", () => {
    applyCartChange(CART, { type: "remove", productId: "a" });

    expect(CART.items).toHaveLength(2);
  });
});
