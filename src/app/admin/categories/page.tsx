import type { Metadata } from "next";

import { CategoryRow, NewCategoryForm } from "@/components/admin-forms";
import { PageTitle } from "@/components/ui";
import { departmentClass } from "@/lib/department";
import { requireAdminForPage } from "@/server/auth/session";
import { listCategoriesWithCounts } from "@/server/services/categories";

export const metadata: Metadata = { title: "Departments" };

export default async function AdminCategoriesPage() {
  await requireAdminForPage("/admin/categories");
  const categories = await listCategoriesWithCounts();

  return (
    <main>
      <PageTitle>Departments</PageTitle>

      {categories.length === 0 ? (
        <p className="mt-6 text-lg">Add your first department below.</p>
      ) : (
        <ul className="mt-4 divide-y-2 divide-ink/10">
          {categories.map((category) => (
            <CategoryRow
              key={String(category._id)}
              id={String(category._id)}
              name={category.name}
              slug={category.slug}
              description={category.description}
              productCount={category.productCount}
              swatchClass={departmentClass(category.slug)}
            />
          ))}
        </ul>
      )}

      <div className="mt-10">
        <NewCategoryForm />
      </div>
    </main>
  );
}
