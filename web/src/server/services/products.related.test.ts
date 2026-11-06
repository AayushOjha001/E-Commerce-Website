import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CategoryModel, ProductModel } from "@/server/models";
import { listRelatedProducts } from "./products";
import { dbReachable, setupTestDatabase, teardownTestDatabase } from "@/test/db";

describe.skipIf(!dbReachable)("listRelatedProducts", () => {
  let categoryId: string;
  let currentId: string;

  beforeAll(async () => {
    await setupTestDatabase();

    const [audio, kitchen] = await CategoryModel.create([
      { name: "Audio", slug: "audio" },
      { name: "Kitchen", slug: "kitchen" },
    ]);
    categoryId = String(audio._id);

    const shared = {
      image: "/images/products/x.svg",
      description: "A description.",
      brand: "Soniq",
      price: 10,
      countInStock: 1,
    };

    const [current] = await ProductModel.create([
      { ...shared, name: "Current", rating: 5, category: audio._id },
      { ...shared, name: "Good", rating: 3, category: audio._id },
      { ...shared, name: "Better", rating: 4, category: audio._id },
      {
        ...shared,
        name: "Retired",
        rating: 5,
        category: audio._id,
        isActive: false,
      },
      { ...shared, name: "Elsewhere", rating: 5, category: kitchen._id },
    ]);
    currentId = String(current._id);
  });

  afterAll(teardownTestDatabase);

  it("returns active products from the category, best rated first", async () => {
    const related = await listRelatedProducts(categoryId, currentId);

    expect(related.map((product) => product.name)).toEqual(["Better", "Good"]);
  });

  it("never recommends the product on screen", async () => {
    const related = await listRelatedProducts(categoryId, currentId);

    expect(related.map((product) => String(product._id))).not.toContain(currentId);
  });

  it("respects the limit", async () => {
    await expect(listRelatedProducts(categoryId, currentId, 1)).resolves.toHaveLength(1);
  });

  it("returns nothing for a malformed category id", async () => {
    await expect(listRelatedProducts("nope", currentId)).resolves.toEqual([]);
  });
});
