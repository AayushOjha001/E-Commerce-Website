import type { Metadata } from "next";

import { ProductForm } from "@/components/admin-forms";
import { PageTitle } from "@/components/ui";
import { requireAdminForPage } from "@/server/auth/session";
import { listCategories } from "@/server/services/categories";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage() {
  await requireAdminForPage("/admin/products/new");
  const categories = await listCategories();

  return (
    <main>
      <PageTitle className="mb-6">Add product</PageTitle>
      <ProductForm
        categories={categories.map((category) => ({
          id: String(category._id),
          name: category.name,
        }))}
      />
    </main>
  );
}
