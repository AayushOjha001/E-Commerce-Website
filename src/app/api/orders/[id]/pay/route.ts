import { jsonOk, readJsonBody, withErrorHandling } from "@/server/api/respond";
import { requireUser } from "@/server/auth/session";
import { payOrder, toPublicOrder } from "@/server/services/orders";
import { paySchema } from "@/server/services/shop-schemas";

// New: the legacy app had no way to mark an order paid.
export const POST = withErrorHandling(
  async (request: Request, context: RouteContext<"/api/orders/[id]/pay">) => {
    const user = await requireUser();
    const { id } = await context.params;
    const { paymentMethod } = paySchema.parse(await readJsonBody(request));
    const order = await payOrder(id, user.id, { paymentMethod });

    return jsonOk({ order: toPublicOrder(order) });
  },
);
