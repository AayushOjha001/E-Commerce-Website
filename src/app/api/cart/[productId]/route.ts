import { jsonOk, readJsonBody, withErrorHandling } from "@/server/api/respond";
import { requireUser } from "@/server/auth/session";
import { removeFromCart, setCartItemQty } from "@/server/services/cart";
import { setCartQtySchema } from "@/server/services/shop-schemas";

type Context = RouteContext<"/api/cart/[productId]">;

// New: the cart page's quantity selector needs to set an exact quantity.
export const PATCH = withErrorHandling(
  async (request: Request, context: Context) => {
    const user = await requireUser();
    const { productId } = await context.params;
    const { qty } = setCartQtySchema.parse(await readJsonBody(request));

    return jsonOk({ cart: await setCartItemQty(user.id, productId, qty) });
  },
);

// Ports DELETE /api/cart/:productId (audit R10).
export const DELETE = withErrorHandling(
  async (_request: Request, context: Context) => {
    const user = await requireUser();
    const { productId } = await context.params;

    return jsonOk({ cart: await removeFromCart(user.id, productId) });
  },
);
