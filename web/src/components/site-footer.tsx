import Link from "next/link";

import { formatPrice } from "@/lib/format";
import { departmentClass } from "@/lib/department";
import { listCategories } from "@/server/services/categories";
import {
  FREE_SHIPPING_THRESHOLD,
  SHIPPING_FLAT_RATE,
} from "@/server/services/pricing";

/**
 * Site footer.
 *
 * The shipping line reads the real pricing constants, so it cannot drift from
 * what checkout charges. A database failure here must not take down the page it
 * sits under, so the department list simply drops out.
 */
export async function SiteFooter() {
  const categories = await listCategories().catch(() => []);

  return (
    <footer className="mt-auto bg-ink text-paper">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-[2fr_1fr_1fr]">
        <div>
          <p className="display text-3xl">E-Shop</p>
          <p className="mt-3 max-w-md text-paper/80">
            This is a demo store. Orders use a mock payment provider, so no card
            is charged and nothing ships.
          </p>
        </div>

        {categories.length > 0 ? (
          <nav aria-label="Departments">
            <h2 className="font-semibold">Departments</h2>
            <ul className="mt-3 space-y-2">
              {categories.map((category) => (
                <li key={String(category._id)} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`size-3 ${departmentClass(category.slug)}`}
                  />
                  <Link
                    href={`/products?category=${category.slug}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <div>
          <h2 className="font-semibold">Shipping</h2>
          <p className="mt-3 text-paper/80">
            Free on orders over {formatPrice(FREE_SHIPPING_THRESHOLD)}. Otherwise
            a flat {formatPrice(SHIPPING_FLAT_RATE)}.
          </p>
        </div>
      </div>
    </footer>
  );
}
