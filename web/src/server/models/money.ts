/**
 * Money handling (PLAN D13).
 *
 * Amounts are stored as `Number` to keep the schema shape the legacy app used,
 * but every monetary field rounds to 2 decimals on write and all arithmetic runs
 * in integer minor units (cents). Summing floats directly drifts —
 * `0.1 + 0.2 !== 0.3` — and an order total that is a cent off is a real bug.
 */

/** Rounds to 2 decimals, half-up, avoiding the float error in `x.toFixed()`. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Converts a currency amount to integer cents. */
export function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

/** Converts integer cents back to a currency amount. */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Sums `price * qty` over line items exactly, by working in cents.
 *
 * Prefer this over `reduce((a, i) => a + i.price * i.qty, 0)`, which is what the
 * legacy order controller did.
 */
export function sumLineItems(
  items: ReadonlyArray<{ price: number; qty: number }>,
): number {
  const cents = items.reduce(
    (total, item) => total + toCents(item.price) * item.qty,
    0,
  );
  return fromCents(cents);
}

/** Mongoose `set` hook for monetary paths, so stored values are always 2dp. */
export const moneySetter = (value: unknown): unknown =>
  typeof value === "number" ? roundMoney(value) : value;
