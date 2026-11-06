import { jsonOk, readJsonBody, withErrorHandling } from "@/server/api/respond";
import { requireAdmin } from "@/server/auth/session";
import { categoryInputSchema, createCategory } from "@/server/services/catalog-admin";
import {
  listCategoriesWithCounts,
  toPublicCategory,
} from "@/server/services/categories";

export const GET = withErrorHandling(async () => {
  await requireAdmin();

  const categories = await listCategoriesWithCounts();
  return jsonOk({ categories: categories.map(toPublicCategory) });
});

export const POST = withErrorHandling(async (request: Request) => {
  await requireAdmin();

  const input = categoryInputSchema.parse(await readJsonBody(request));
  const category = await createCategory(input);

  return jsonOk({ category: { ...category, id: String(category._id) } }, 201);
});
