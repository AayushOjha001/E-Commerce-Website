import { jsonOk, readJsonBody, withErrorHandling } from "@/server/api/respond";
import { requireUser } from "@/server/auth/session";
import {
  createOrderFromCart,
  listOrdersForUser,
  toPublicOrder,
} from "@/server/services/orders";
import { checkoutSchema } from "@/server/services/shop-schemas";

// Ports GET /api/orders/myorders (audit R12). The id-less path returns the
// caller's own orders, so there is no user id in it to tamper with.
export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  const orders = await listOrdersForUser(user.id);

  return jsonOk({
    orders: orders.map(({ _id, ...order }) => ({ ...order, id: String(_id) })),
  });
});

// Ports POST /api/orders (audit R11), which always threw a ReferenceError.
// Nothing about the money comes from the body: the schema accepts only an
// address and a payment method, and totals are rebuilt from the database.
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser();
  const input = checkoutSchema.parse(await readJsonBody(request));
  const order = await createOrderFromCart(user.id, input);

  return jsonOk({ order: toPublicOrder(order) }, 201);
});
