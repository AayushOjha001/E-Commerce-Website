import Link from "next/link";

import { ProductArt } from "@/components/product-art";
import { departmentClass } from "@/lib/department";
import { formatPrice, pluralise } from "@/lib/format";
import type { PublicProduct } from "@/server/services/products";

/**
 * A department, drawn as a shelf.
 *
 * This is the shop's one bold idea (docs/agent/DESIGN.md). Products stand on the
 * plank, and name and price hang below it like shelf-edge labels.
 *
 * The plank and the paper strip under it are full-bleed background layers, and
 * each product is one link holding both its drawing and its label. That is why
 * the label area has a fixed height: it is what lets the background layers line
 * up with the products. On a phone the shelf scrolls sideways as a single unit,
 * so a drawing can never drift away from its own label.
 */
export function DepartmentShelf({
  name,
  slug,
  productCount,
  products,
}: {
  name: string;
  slug: string;
  productCount: number;
  products: PublicProduct[];
}) {
  return (
    <section
      aria-labelledby={`shelf-${slug}`}
      data-field
      className={`relative ${departmentClass(slug)}`}
    >
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 bg-paper" />
      <div aria-hidden className="absolute inset-x-0 bottom-24 h-3 bg-ink" />

      <div className="relative mx-auto grid max-w-[1400px] grid-cols-1 px-4 pt-8 sm:px-6 lg:grid-cols-[minmax(240px,1fr)_3fr] lg:gap-8">
        <div className="pb-4 lg:pb-0">
          <h2 id={`shelf-${slug}`} className="display text-4xl lg:text-5xl">
            <Link
              href={`/products?category=${slug}`}
              className="underline-offset-8 hover:underline"
            >
              {name}
            </Link>
          </h2>
          <p className="mt-2 font-medium">{pluralise(productCount, "product")}</p>
        </div>

        <ul className="-mx-4 flex min-w-0 gap-3 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-4 lg:overflow-visible lg:px-0">
          {products.map((product) => (
            <li key={product.id} className="flex w-44 shrink-0 flex-col justify-end lg:w-auto">
              <Link href={`/products/${product.slug}`} className="group block">
                {/* Cropped at the drawings' shared baseline (y=540 of 600), so
                    they stand on the plank at any width. */}
                <ProductArt
                  src={product.image}
                  alt=""
                  size={240}
                  sizes="(min-width: 1024px) 18vw, 176px"
                  className="lift aspect-[600/544] w-full max-w-60 object-cover object-top group-hover:-translate-y-1.5"
                />

                <span className="block h-24 pt-6">
                  <span className="line-clamp-2 leading-tight font-semibold">
                    {product.name}
                  </span>
                  <span className="price mt-0.5 block text-ink-soft">
                    {product.countInStock === 0
                      ? "Out of stock"
                      : formatPrice(product.price)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
