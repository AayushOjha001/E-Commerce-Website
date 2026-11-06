import Link from "next/link";

import { DepartmentShelf } from "@/components/department-shelf";
import { LINK_CLASS } from "@/components/ui";
import { formatPriceInText, pluralise } from "@/lib/format";
import { listCategoriesWithCounts } from "@/server/services/categories";
import { FREE_SHIPPING_THRESHOLD } from "@/server/services/pricing";
import { listProducts, toPublicPage } from "@/server/services/products";

/** How many products stand on each shelf. The band's grid has four columns. */
const SHELF_SIZE = 4;

// Replaces the legacy HomeScreen.jsx (audit P1), which hardcoded three products.
export default async function Home() {
  const categories = await listCategoriesWithCounts();
  const stocked = categories.filter((category) => category.productCount > 0);

  const shelves = await Promise.all(
    stocked.map(async (category) => {
      const page = await listProducts({
        category: category.slug,
        limit: SHELF_SIZE,
        sort: "rating",
      });

      return { category, products: toPublicPage(page).items };
    }),
  );

  const totalProducts = stocked.reduce(
    (total, category) => total + category.productCount,
    0,
  );

  return (
    <main>
      <div className="mx-auto max-w-[1400px] px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
        <h1 className="display text-5xl sm:text-7xl lg:text-8xl">
          Walk the shelves
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft sm:text-xl">
          {pluralise(totalProducts, "product")} across{" "}
          {pluralise(stocked.length, "department")}. Free shipping on orders over{" "}
          {formatPriceInText(FREE_SHIPPING_THRESHOLD)}.
        </p>
      </div>

      {shelves.length > 0 ? (
        shelves.map(({ category, products }) => (
          <DepartmentShelf
            key={category.slug}
            name={category.name}
            slug={category.slug}
            productCount={category.productCount}
            products={products}
          />
        ))
      ) : (
        <p className="mx-auto w-full max-w-[1400px] px-4 pb-16 text-lg sm:px-6">
          The shelves are empty. Run <code>npm run seed</code> to stock the demo
          catalog, or add products from the{" "}
          <Link href="/admin" className={LINK_CLASS}>
            admin area
          </Link>
          .
        </p>
      )}
    </main>
  );
}
