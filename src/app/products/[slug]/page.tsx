import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AddToCart } from "@/components/add-to-cart";
import { ProductArt } from "@/components/product-art";
import { ProductGrid } from "@/components/product-tile";
import { catalogHref } from "@/lib/catalog-url";
import { departmentClass } from "@/lib/department";
import { formatPrice, pluralise } from "@/lib/format";
import { productJsonLd } from "@/lib/product-json-ld";
import { siteUrl } from "@/lib/site-url";
import {
  getProductBySlug,
  listRelatedProducts,
  toPublicProduct,
} from "@/server/services/products";

/** At or below this, the page warns that stock is running out. */
const LOW_STOCK_THRESHOLD = 5;

// Cached per request: metadata and the page both need the product, and without
// this they would run the same query twice.
const loadProduct = cache(async (slug: string) => {
  const product = await getProductBySlug(slug);
  return product ? toPublicProduct(product) : null;
});

export async function generateMetadata(
  props: PageProps<"/products/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const product = await loadProduct(slug);

  if (!product) return { title: "Product not found" };

  return {
    title: product.name,
    description: product.description,
    openGraph: {
      title: product.name,
      description: product.description,
      images: [product.image],
    },
  };
}

function StockLine({ count }: { count: number }) {
  if (count === 0) {
    return <p className="font-semibold text-danger">Out of stock</p>;
  }
  if (count <= LOW_STOCK_THRESHOLD) {
    return <p className="font-semibold text-danger">Only {count} left</p>;
  }
  return <p className="font-semibold text-success">In stock</p>;
}

// Replaces the legacy ProductScreen.jsx (audit P2), which ignored the URL and
// always rendered the same hardcoded iPhone.
export default async function ProductPage(props: PageProps<"/products/[slug]">) {
  const { slug } = await props.params;
  const product = await loadProduct(slug);

  if (!product) notFound();

  const related = product.category
    ? (await listRelatedProducts(product.category.id, product.id)).map(
        toPublicProduct,
      )
    : [];

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: productJsonLd(product, siteUrl()) }}
      />

      <div className="grid lg:grid-cols-2">
        <div
          data-field
          className={`flex items-end justify-center px-6 pt-8 ${departmentClass(product.category?.slug)}`}
        >
          <ProductArt
            src={product.image}
            alt={product.name}
            size={560}
            eager
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="w-full max-w-md lg:max-w-xl"
          />
        </div>

        <div className="px-4 py-8 sm:px-8 lg:py-12">
          {product.category ? (
            <nav aria-label="Breadcrumb">
              <Link
                href={catalogHref({ category: product.category.slug })}
                className="font-medium underline-offset-4 hover:underline"
              >
                {product.category.name}
              </Link>
            </nav>
          ) : null}

          <h1 className="display mt-3 text-4xl sm:text-6xl">{product.name}</h1>
          <p className="mt-2 text-lg text-ink-soft">by {product.brand}</p>

          <p className="price mt-6 text-4xl font-bold">
            {formatPrice(product.price)}
          </p>

          <div className="mt-2 space-y-1">
            <StockLine count={product.countInStock} />
            {product.numReviews > 0 ? (
              <p className="text-ink-soft">
                Rated {product.rating.toFixed(1)} out of 5 from{" "}
                {pluralise(product.numReviews, "review")}
              </p>
            ) : null}
          </div>

          {product.countInStock > 0 ? (
            <AddToCart
              productId={product.id}
              countInStock={product.countInStock}
              returnTo={`/products/${product.slug}`}
            />
          ) : null}

          <p className="mt-6 max-w-[62ch] text-lg leading-relaxed">
            {product.description}
          </p>
        </div>
      </div>

      {related.length > 0 ? (
        <section
          aria-labelledby="related"
          className="mx-auto w-full max-w-[1400px] px-4 py-12 sm:px-6"
        >
          <h2 id="related" className="display text-2xl sm:text-3xl">
            More from {product.category?.name}
          </h2>
          <div className="mt-6">
            <ProductGrid products={related} />
          </div>
        </section>
      ) : null}
    </main>
  );
}
