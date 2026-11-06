import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { ProductActiveToggle } from "@/components/admin-forms";
import { Pagination } from "@/components/pagination";
import { INPUT_CLASS, LINK_CLASS, PageTitle, buttonClass } from "@/components/ui";
import { catalogHref } from "@/lib/catalog-url";
import { departmentClass } from "@/lib/department";
import { formatPrice } from "@/lib/format";
import { requireAdminForPage } from "@/server/auth/session";
import { parseCatalogPageParams } from "@/server/services/catalog-query";
import { listProducts } from "@/server/services/products";

export const metadata: Metadata = { title: "Products" };

const PAGE_SIZE = 20;

export default async function AdminProductsPage(
  props: PageProps<"/admin/products">,
) {
  await requireAdminForPage("/admin/products");

  const { search, page: requestedPage } = parseCatalogPageParams(
    await props.searchParams,
  );
  const page = await listProducts({
    search,
    page: requestedPage,
    limit: PAGE_SIZE,
    includeInactive: true,
  });

  const hrefForPage = (target: number) =>
    catalogHref({ search }, { page: target }).replace("/products", "/admin/products");

  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageTitle>Products</PageTitle>
        <Link href="/admin/products/new" className={buttonClass()}>
          Add product
        </Link>
      </div>

      <Form action="/admin/products" className="mt-6 max-w-sm">
        <label htmlFor="admin-search" className="sr-only">
          Search products
        </label>
        <input
          id="admin-search"
          name="search"
          type="search"
          defaultValue={search}
          placeholder="Search products"
          className={INPUT_CLASS}
        />
      </Form>

      {page.items.length === 0 ? (
        <p className="mt-6 text-lg">No products found.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b-2 border-ink">
                <th scope="col" className="py-2 pr-4 font-semibold">Name</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Department</th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">Price</th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">Stock</th>
                <th scope="col" className="py-2 pr-4 font-semibold">State</th>
                <th scope="col" className="py-2 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((product) => (
                <tr key={String(product._id)} className="border-b-2 border-ink/10">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/admin/products/${String(product._id)}`}
                      className={LINK_CLASS}
                    >
                      {product.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={`size-3 ${departmentClass(product.category?.slug)}`}
                      />
                      {product.category?.name ?? "None"}
                    </span>
                  </td>
                  <td className="price py-2 pr-4 text-right">
                    {formatPrice(product.price)}
                  </td>
                  <td
                    className={`price py-2 pr-4 text-right ${product.countInStock === 0 ? "font-semibold text-danger" : ""}`}
                  >
                    {product.countInStock}
                  </td>
                  <td className="py-2 pr-4">
                    {product.isActive ? "On sale" : "Withdrawn"}
                  </td>
                  <td className="py-2 text-right">
                    <ProductActiveToggle
                      id={String(product._id)}
                      isActive={product.isActive}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page.page}
        totalPages={page.totalPages}
        hrefForPage={hrefForPage}
      />
    </main>
  );
}
