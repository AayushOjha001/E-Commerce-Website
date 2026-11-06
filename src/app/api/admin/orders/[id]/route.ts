import { z } from "zod";

import { jsonOk, readJsonBody, withErrorHandling } from "@/server/api/respond";
import { requireAdmin } from "@/server/auth/session";
import { ORDER_STATUSES } from "@/server/models/order";
import { toPublicOrder } from "@/server/services/orders";
import { updateOrderStatus } from "@/server/services/orders-admin";

const patchSchema = z.object({ status: z.enum(ORDER_STATUSES) });

export const PATCH = withErrorHandling(
  async (request: Request, context: RouteContext<"/api/admin/orders/[id]">) => {
    await requireAdmin();

    const { id } = await context.params;
    const { status } = patchSchema.parse(await readJsonBody(request));
    const order = await updateOrderStatus(id, status);

    return jsonOk({ order: toPublicOrder(order) });
  },
);
