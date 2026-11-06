import type { PublicProduct } from "@/server/services/products";

/**
 * schema.org Product data, ready to place in a script tag.
 *
 * `<` is escaped because this text goes into the page unescaped. Without it, a
 * product named `</script><script>...` closes the tag and runs as markup.
 */
export function productJsonLd(product: PublicProduct, origin: URL): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: new URL(product.image, origin).href,
    brand: { "@type": "Brand", name: product.brand },
    offers: {
      "@type": "Offer",
      price: product.price,
      priceCurrency: "USD",
      availability:
        product.countInStock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    },
    ...(product.numReviews > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.numReviews,
          },
        }
      : {}),
  }).replace(/</g, "\\u003c");
}
