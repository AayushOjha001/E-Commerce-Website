import { jsonOk, readJsonBody, withErrorHandling } from "@/server/api/respond";
import { requireAdmin } from "@/server/auth/session";
import { parseCatalogQuery } from "@/server/services/catalog-query";
import { createProduct, productInputSchema } from "@/server/services/catalog-admin";
import { listProducts, toPublicPage } from "@/server/services/products";

// Includes withdrawn products, which the public list hides.
export const GET = withErrorHandling(async (request: Request) => {
  await requireAdmin();

  const options = parseCatalogQuery(new URL(request.url).searchParams);
  const page = await listProducts({ ...options, includeInactive: true });

  return jsonOk(toPublicPage(page));
});

// Replaces the legacy POST /api/products, which needed no token at all (audit B5).
export const POST = withErrorHandling(async (request: Request) => {
  await requireAdmin();

  const input = productInputSchema.parse(await readJsonBody(request));
  const product = await createProduct(input);

  return jsonOk({ product: { ...product, id: String(product._id) } }, 201);
});
