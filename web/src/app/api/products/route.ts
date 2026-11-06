import { jsonOk, withErrorHandling } from "@/server/api/respond";
import { parseCatalogQuery } from "@/server/services/catalog-query";
import { listProducts, toPublicPage } from "@/server/services/products";

// Ports GET /api/products (audit R5), which returned the whole collection with
// no paging, search, filter or sort. Writes moved to /api/admin/products: the
// legacy POST on this path needed no auth at all (audit B5).
export const GET = withErrorHandling(async (request: Request) => {
  const options = parseCatalogQuery(new URL(request.url).searchParams);
  const page = await listProducts(options);

  return jsonOk(toPublicPage(page));
});
