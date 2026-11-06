import { jsonOk, withErrorHandling } from "@/server/api/respond";
import { requireUser } from "@/server/auth/session";
import { toPublicOrder } from "@/server/services/orders";
import { cancelOwnOrder } from "@/server/services/orders-admin";

export const POST = withErrorHandling(
  async (_request: Request, context: RouteContext<"/api/orders/[id]/cancel">) => {
    const user = await requireUser();
    const { id } = await context.params;
    const order = await cancelOwnOrder(id, user.id);

    return jsonOk({ order: toPublicOrder(order) });
  },
);
