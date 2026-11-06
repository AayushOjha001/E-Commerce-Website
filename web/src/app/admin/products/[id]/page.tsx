import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductForm } from "@/components/admin-forms";
import { LINK_CLASS, PageTitle } from "@/components/ui";
import { requireAdminForPage } from "@/server/auth/session";
import { listCategories } from "@/server/services/categories";
import { getProductById } from "@/server/services/products";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage(
  props: PageProps<"/admin/products/[id]">,
) {
  const { id } = await props.params;
  await requireAdminForPage(`/admin/products/${id}`);

  const [product, categories] = await Promise.all([
    getProductById(id, { includeInactive: true }),
    listCategories(),
  ]);

  if (!product) notFound();

  return (
    <main>
      <PageTitle className="mb-2">{product.name}</PageTitle>
      <p className="mb-6">
        {product.isActive ? (
          <Link href={`/products/${product.slug}`} className={LINK_CLASS}>
            View in the shop
          </Link>
        ) : (
          "Withdrawn from sale"
        )}
      </p>

      <ProductForm
        product={{
          id: String(product._id),
          name: product.name,
          slug: product.slug,
          brand: product.brand,
          description: product.description,
          image: product.image,
          category: product.category ? String(product.category._id) : "",
          price: product.price,
          countInStock: product.countInStock,
        }}
        categories={categories.map((category) => ({
          id: String(category._id),
          name: category.name,
        }))}
      />
    </main>
  );
}
