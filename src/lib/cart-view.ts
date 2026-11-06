import { sumLineItems } from "@/server/models/money";
import type { CartView } from "@/server/services/cart";

export type CartChange =
  | { type: "qty"; productId: string; qty: number }
  | { type: "remove"; productId: string };

/**
 * Applies a change to a cart on the client, for optimistic updates.
 *
 * Totals are recomputed through the same cent-exact helper the server uses, so
 * the figures do not flicker when the real cart arrives.
 */
export function applyCartChange(cart: CartView, change: CartChange): CartView {
  const items =
    change.type === "remove"
      ? cart.items.filter((item) => item.productId !== change.productId)
      : cart.items.map((item) =>
          item.productId === change.productId
            ? {
                ...item,
                qty: change.qty,
                lineTotal: sumLineItems([{ price: item.price, qty: change.qty }]),
                exceedsStock: change.qty > item.countInStock,
              }
            : item,
        );

  return {
    items,
    subtotal: sumLineItems(items),
    itemCount: items.reduce((total, item) => total + item.qty, 0),
    hasIssues: items.some((item) => item.exceedsStock),
  };
}
