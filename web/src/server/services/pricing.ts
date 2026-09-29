import { fromCents, roundMoney, toCents } from "@/server/models";

/**
 * Order pricing policy, in one place.
 *
 * Every figure here is derived on the server from database prices. The legacy
 * controller took `orderItems` — prices included — straight from the request
 * body, and never set tax or shipping at all, so they silently defaulted to 0
 * (audit B3). A client could order anything at any price.
 */

/** 13% sales tax. A single flat rate; per-region rates are out of scope. */
export const TAX_RATE = 0.13;

/** Flat shipping fee, waived above the threshold. */
export const SHIPPING_FLAT_RATE = 9.99;
export const FREE_SHIPPING_THRESHOLD = 100;

export type PriceableItem = {
  price: number;
  qty: number;
};

export type OrderTotals = {
  itemsPrice: number;
  taxPrice: number;
  shippingPrice: number;
  totalPrice: number;
};

/**
 * Computes the four order money fields from line items.
 *
 * Arithmetic runs in integer cents throughout (PLAN D13): summing
 * `price * qty` as floats drifts, and a total that is a cent out is a real bug.
 */
export function calculateOrderTotals(
  items: ReadonlyArray<PriceableItem>,
): OrderTotals {
  const itemsCents = items.reduce(
    (total, item) => total + toCents(item.price) * item.qty,
    0,
  );

  const taxCents = Math.round(itemsCents * TAX_RATE);

  // Free shipping is decided on the pre-tax subtotal, and an empty order is
  // never charged shipping.
  const shippingCents =
    itemsCents === 0 || itemsCents >= toCents(FREE_SHIPPING_THRESHOLD)
      ? 0
      : toCents(SHIPPING_FLAT_RATE);

  return {
    itemsPrice: fromCents(itemsCents),
    taxPrice: fromCents(taxCents),
    shippingPrice: fromCents(shippingCents),
    totalPrice: fromCents(itemsCents + taxCents + shippingCents),
  };
}

/**
 * Whether a subtotal qualifies for free shipping, for display in the UI.
 *
 * Describes a non-empty cart. An empty order also ships free per
 * `calculateOrderTotals`, but that is a "nothing to ship" case, not a perk to
 * advertise, and an empty cart cannot reach checkout anyway.
 */
export function qualifiesForFreeShipping(subtotal: number): boolean {
  return roundMoney(subtotal) >= FREE_SHIPPING_THRESHOLD;
}
