import { z } from "zod";

import { jsonOk, withErrorHandling } from "@/server/api/respond";
import { requireAdmin } from "@/server/auth/session";
import { ORDER_STATUSES } from "@/server/models/order";
import { listAllOrders } from "@/server/services/orders-admin";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
});

export const GET = withErrorHandling(async (request: Request) => {
  await requireAdmin();

  const params = new URL(request.url).searchParams;
  const options = querySchema.parse({
    page: params.get("page") ?? undefined,
    status: params.get("status") ?? undefined,
  });

  return jsonOk(await listAllOrders(options));
});
