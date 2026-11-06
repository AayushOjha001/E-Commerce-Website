import { z } from "zod";

import { jsonOk, readJsonBody, withErrorHandling } from "@/server/api/respond";
import { requireAdmin } from "@/server/auth/session";
import {
  productPatchSchema,
  setProductActive,
  updateProduct,
} from "@/server/services/catalog-admin";

type Context = RouteContext<"/api/admin/products/[id]">;

const patchSchema = productPatchSchema.extend({
  isActive: z.boolean().optional(),
});

export const PATCH = withErrorHandling(
  async (request: Request, context: Context) => {
    await requireAdmin();

    const { id } = await context.params;
    const { isActive, ...fields } = patchSchema.parse(await readJsonBody(request));

    let product = await updateProduct(id, fields);
    if (isActive !== undefined) product = await setProductActive(id, isActive);

    return jsonOk({ product: { ...product, id: String(product._id) } });
  },
);

// Withdraws rather than deletes, so past orders keep their link to the product.
export const DELETE = withErrorHandling(
  async (_request: Request, context: Context) => {
    await requireAdmin();

    const { id } = await context.params;
    const product = await setProductActive(id, false);

    return jsonOk({ product: { ...product, id: String(product._id) } });
  },
);
