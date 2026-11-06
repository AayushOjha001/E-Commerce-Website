import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { Pagination } from "@/components/pagination";
import { ProductGrid } from "@/components/product-tile";
import { INPUT_CLASS, LINK_CLASS, PageTitle, buttonClass } from "@/components/ui";
import { catalogHref } from "@/lib/catalog-url";
import { departmentClass } from "@/lib/department";
import { pluralise } from "@/lib/format";
import { parseCatalogPageParams } from "@/server/services/catalog-query";
import {
  listCategoriesWithCounts,
  type CategoryWithCount,
} from "@/server/services/categories";
import {
  listProducts,
  toPublicPage,
  type ProductSort,
} from "@/server/services/products";

const SORT_LABELS: Partial<Record<ProductSort, string>> = {
  newest: "Newest",
  "price-asc": "Price, low to high",
  "price-desc": "Price, high to low",
  rating: "Highest rated",
};

function pageTitle(search: string | undefined, category?: CategoryWithCount) {
  if (search) return `Results for “${search}”`;
  return category?.name ?? "All products";
}

export async function generateMetadata(
  props: PageProps<"/products">,
): Promise<Metadata> {
  const { search, category: slug } = parseCatalogPageParams(
    await props.searchParams,
  );

  if (search) {
    // Search result pages are unbounded, so they stay out of the index.
    return { title: `Results for ${search}`, robots: { index: false } };
  }

  const categories = slug ? await listCategoriesWithCounts() : [];
  const category = categories.find((entry) => entry.slug === slug);

  return {
    title: category?.name ?? "All products",
    description: category?.description,
  };
}

export default async function ProductsPage(props: PageProps<"/products">) {
  const options = parseCatalogPageParams(await props.searchParams);

  const [categories, page] = await Promise.all([
    listCategoriesWithCounts(),
    listProducts(options).then(toPublicPage),
  ]);

  const activeCategory = categories.find(
    (category) => category.slug === options.category,
  );
  const hasFilters = Boolean(
    options.search ||
      options.category ||
      options.minPrice !== undefined ||
      options.maxPrice !== undefined,
  );

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-12 sm:px-6">
      <PageTitle>{pageTitle(options.search, activeCategory)}</PageTitle>
      <p className="mt-2 text-lg text-ink-soft" role="status">
        {pluralise(page.total, "product")}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-8">
          <nav aria-label="Departments">
            <h2 className="font-semibold">Departments</h2>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 lg:block lg:space-y-1">
              <li>
                <Link
                  href={catalogHref(options, { category: undefined })}
                  aria-current={options.category ? undefined : "true"}
                  className="underline-offset-4 hover:underline aria-[current]:font-bold"
                >
                  All products
                </Link>
              </li>
              {categories.map((category) => (
                <li key={category.slug} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`size-3 ${departmentClass(category.slug)}`}
                  />
                  <Link
                    href={catalogHref(options, { category: category.slug })}
                    aria-current={
                      category.slug === options.category ? "true" : undefined
                    }
                    className="underline-offset-4 hover:underline aria-[current]:font-bold"
                  >
                    {category.name}
                  </Link>
                  <span className="price text-sm text-ink-soft">
                    {category.productCount}
                  </span>
                </li>
              ))}
            </ul>
          </nav>

          <Form action="/products" className="space-y-4">
            {options.search ? (
              <input type="hidden" name="search" value={options.search} />
            ) : null}
            {options.category ? (
              <input type="hidden" name="category" value={options.category} />
            ) : null}

            <div>
              <label htmlFor="sort" className="mb-1 block font-semibold">
                Sort by
              </label>
              <AutoSubmitSelect
                id="sort"
                name="sort"
                defaultValue={options.sort ?? ""}
                className={INPUT_CLASS}
              >
                <option value="">
                  {options.search ? "Best match" : "Newest"}
                </option>
                {Object.entries(SORT_LABELS)
                  .filter(([value]) => value !== "newest")
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </AutoSubmitSelect>
            </div>

            <fieldset>
              <legend className="mb-1 font-semibold">Price</legend>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="minPrice" className="mb-1 block text-sm">
                    From
                  </label>
                  <input
                    id="minPrice"
                    name="minPrice"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    defaultValue={options.minPrice}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="maxPrice" className="mb-1 block text-sm">
                    To
                  </label>
                  <input
                    id="maxPrice"
                    name="maxPrice"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    defaultValue={options.maxPrice}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
            </fieldset>

            <button
              type="submit"
              className={buttonClass({ variant: "secondary", className: "w-full" })}
            >
              Apply filters
            </button>
          </Form>
        </aside>

        <section aria-label="Products" className="min-w-0">
          {page.items.length > 0 ? (
            <>
              <ProductGrid products={page.items} />
              <Pagination
                page={page.page}
                totalPages={page.totalPages}
                hrefForPage={(target) => catalogHref(options, { page: target })}
              />
            </>
          ) : (
            <div>
              <p className="text-lg font-semibold">
                {hasFilters
                  ? "Nothing matches those filters."
                  : "There are no products yet."}
              </p>
              {hasFilters ? (
                <p className="mt-2">
                  <Link href="/products" className={LINK_CLASS}>
                    Clear filters and see everything
                  </Link>
                </p>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
