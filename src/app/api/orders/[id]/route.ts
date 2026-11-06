import { jsonOk, withErrorHandling } from "@/server/api/respond";
import { requireUser } from "@/server/auth/session";
import { getOrderForUser, toPublicOrder } from "@/server/services/orders";

// Ports GET /api/orders/:id (audit R13), closing the IDOR found as B4. Admins may
// read any order, through the same ownership check.
export const GET = withErrorHandling(
  async (_request: Request, context: RouteContext<"/api/orders/[id]">) => {
    const user = await requireUser();
    const { id } = await context.params;
    const order = await getOrderForUser(id, user.id, {
      isAdmin: user.role === "admin",
    });

    return jsonOk({ order: toPublicOrder(order) });
  },
);
