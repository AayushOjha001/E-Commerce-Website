import { describe, expect, it } from "vitest";

import { productJsonLd } from "./product-json-ld";
import type { PublicProduct } from "@/server/services/products";

const PRODUCT: PublicProduct = {
  id: "1",
  name: "Kettle",
  slug: "kettle",
  image: "/images/products/kettle.svg",
  description: "A kettle.",
  brand: "Hearth",
  category: null,
  price: 79.99,
  countInStock: 2,
  rating: 4.5,
  numReviews: 3,
};

const ORIGIN = new URL("https://shop.example");

describe("productJsonLd", () => {
  it("cannot be broken out of with a product name", () => {
    const text = productJsonLd(
      { ...PRODUCT, name: "</script><script>alert(1)</script>" },
      ORIGIN,
    );

    expect(text).not.toContain("<");
    expect(JSON.parse(text).name).toBe("</script><script>alert(1)</script>");
  });

  it("uses an absolute image URL", () => {
    expect(JSON.parse(productJsonLd(PRODUCT, ORIGIN)).image).toBe(
      "https://shop.example/images/products/kettle.svg",
    );
  });

  it("leaves an image hosted elsewhere alone", () => {
    const text = productJsonLd(
      { ...PRODUCT, image: "https://cdn.example/kettle.png" },
      ORIGIN,
    );

    expect(JSON.parse(text).image).toBe("https://cdn.example/kettle.png");
  });

  it("reports availability", () => {
    const sold = JSON.parse(productJsonLd({ ...PRODUCT, countInStock: 0 }, ORIGIN));

    expect(sold.offers.availability).toBe("https://schema.org/OutOfStock");
  });

  it("omits ratings for a product nobody has reviewed", () => {
    const fresh = JSON.parse(productJsonLd({ ...PRODUCT, numReviews: 0 }, ORIGIN));

    expect(fresh).not.toHaveProperty("aggregateRating");
  });
});
