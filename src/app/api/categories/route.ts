import { jsonOk, withErrorHandling } from "@/server/api/respond";
import {
  listCategoriesWithCounts,
  toPublicCategory,
} from "@/server/services/categories";

// New: the legacy app stored the category as a free-text string on each product.
export const GET = withErrorHandling(async () => {
  const categories = await listCategoriesWithCounts();

  return jsonOk({ categories: categories.map(toPublicCategory) });
});
