import { jsonOk, readJsonBody, withErrorHandling } from "@/server/api/respond";
import { requireUser } from "@/server/auth/session";
import { addToCart, getCart } from "@/server/services/cart";
import { addToCartSchema } from "@/server/services/shop-schemas";

// Ports GET /api/cart (audit R8).
export const GET = withErrorHandling(async () => {
  const user = await requireUser();

  return jsonOk({ cart: await getCart(user.id) });
});

// Ports POST /api/cart (audit R9), which had no quantity or stock validation and
// overwrote the quantity instead of adding to it.
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser();
  const { productId, qty } = addToCartSchema.parse(await readJsonBody(request));

  return jsonOk({ cart: await addToCart(user.id, productId, qty) });
});
