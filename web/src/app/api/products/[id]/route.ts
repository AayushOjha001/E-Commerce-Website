import { jsonOk, withErrorHandling } from "@/server/api/respond";
import { requireProductById, toPublicProduct } from "@/server/services/products";

// Ports GET /api/products/:id (audit R7), which never worked: the Express route
// was registered as ":id" with no leading slash (B1) and its controller forgot
// to `await` the query (B7).
export const GET = withErrorHandling(
  async (_request: Request, context: RouteContext<"/api/products/[id]">) => {
    const { id } = await context.params;
    const product = await requireProductById(id);

    return jsonOk({ product: toPublicProduct(product) });
  },
);
