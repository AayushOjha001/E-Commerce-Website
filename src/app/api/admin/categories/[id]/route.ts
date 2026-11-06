import { jsonOk, readJsonBody, withErrorHandling } from "@/server/api/respond";
import { requireAdmin } from "@/server/auth/session";
import {
  categoryPatchSchema,
  deleteCategory,
  updateCategory,
} from "@/server/services/catalog-admin";

type Context = RouteContext<"/api/admin/categories/[id]">;

export const PATCH = withErrorHandling(
  async (request: Request, context: Context) => {
    await requireAdmin();

    const { id } = await context.params;
    const patch = categoryPatchSchema.parse(await readJsonBody(request));
    const category = await updateCategory(id, patch);

    return jsonOk({ category: { ...category, id: String(category._id) } });
  },
);

export const DELETE = withErrorHandling(
  async (_request: Request, context: Context) => {
    await requireAdmin();

    const { id } = await context.params;
    await deleteCategory(id);

    return jsonOk({ deleted: true });
  },
);
