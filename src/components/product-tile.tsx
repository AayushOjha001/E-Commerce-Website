import Link from "next/link";

import { ProductArt } from "@/components/product-art";
import { departmentClass } from "@/lib/department";
import { formatPrice } from "@/lib/format";
import type { PublicProduct } from "@/server/services/products";

/**
 * A product in a grid: a flat colour field, not a card.
 *
 * Tiles sit flush against each other, and the department colour is the only
 * thing that separates them. The whole tile is one link, so name and price are
 * inside it rather than being separate tab stops.
 */
export function ProductTile({ product }: { product: PublicProduct }) {
  const soldOut = product.countInStock === 0;

  return (
    <Link
      href={`/products/${product.slug}`}
      data-field
      className={`group flex h-full flex-col p-4 sm:p-5 ${departmentClass(product.category?.slug)}`}
    >
      <ProductArt
        src={product.image}
        alt=""
        size={320}
        sizes="(min-width: 1024px) 25vw, 50vw"
        className="lift mx-auto w-full max-w-64 group-hover:-translate-y-1.5"
      />

      <div className="mt-3 flex flex-1 flex-col justify-end">
        <h3 className="text-lg leading-tight font-semibold">{product.name}</h3>
        <p className="text-sm text-ink/80">{product.brand}</p>
        <p className="price mt-2 text-lg font-bold">
          {formatPrice(product.price)}
        </p>
        {soldOut ? <p className="text-sm font-semibold">Out of stock</p> : null}
      </div>
    </Link>
  );
}

/** Tiles flush edge to edge. A single gap would turn them back into cards. */
export function ProductGrid({ products }: { products: PublicProduct[] }) {
  return (
    <ul className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <li key={product.id}>
          <ProductTile product={product} />
        </li>
      ))}
    </ul>
  );
}
