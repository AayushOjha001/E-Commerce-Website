import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CategoryModel, ProductModel } from "@/server/models";
import {
  getCategoryBySlug,
  listCategories,
  listCategoriesWithCounts,
  requireCategoryBySlug,
} from "./categories";
import {
  clearDatabase,
  dbReachable,
  requireDb,
  setupTestDatabase,
  teardownTestDatabase,
} from "@/test/db";

describe("database availability", () => {
  it.runIf(requireDb)("is reachable, because REQUIRE_DB=1", () => {
    expect(dbReachable).toBe(true);
  });
});

describe.skipIf(!dbReachable)("categories service", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);

  beforeEach(async () => {
    await clearDatabase();

    const [audio, computers] = await CategoryModel.create([
      { name: "Audio", slug: "audio" },
      { name: "Computers", slug: "computers" },
      { name: "Empty Shelf", slug: "empty-shelf" },
    ]);

    await ProductModel.create([
      {
        name: "Headphones",
        slug: "headphones",
        image: "/a.svg",
        description: "d",
        brand: "b",
        category: audio._id,
        price: 10,
        countInStock: 1,
      },
      {
        name: "Speaker",
        slug: "speaker",
        image: "/b.svg",
        description: "d",
        brand: "b",
        category: audio._id,
        price: 20,
        countInStock: 1,
      },
      {
        name: "Laptop",
        slug: "laptop",
        image: "/c.svg",
        description: "d",
        brand: "b",
        category: computers._id,
        price: 30,
        countInStock: 1,
      },
      {
        name: "Retired",
        slug: "retired",
        image: "/d.svg",
        description: "d",
        brand: "b",
        category: computers._id,
        price: 5,
        countInStock: 0,
        isActive: false,
      },
    ]);
  });

  it("lists categories alphabetically", async () => {
    const categories = await listCategories();

    expect(categories.map((c) => c.slug)).toEqual([
      "audio",
      "computers",
      "empty-shelf",
    ]);
  });

  it("counts only active products per category", async () => {
    const categories = await listCategoriesWithCounts();

    const counts = Object.fromEntries(
      categories.map((c) => [c.slug, c.productCount]),
    );

    expect(counts).toEqual({
      audio: 2,
      // The inactive "Retired" product must not be counted.
      computers: 1,
      "empty-shelf": 0,
    });
  });

  it("includes categories with no products at all", async () => {
    const categories = await listCategoriesWithCounts();

    expect(categories.map((c) => c.slug)).toContain("empty-shelf");
  });

  it("finds a category by slug, case-insensitively", async () => {
    await expect(getCategoryBySlug("AUDIO").then((c) => c?.name)).resolves.toBe(
      "Audio",
    );
  });

  it("returns null for an unknown slug", async () => {
    await expect(getCategoryBySlug("nope")).resolves.toBeNull();
  });

  it("requireCategoryBySlug throws not_found", async () => {
    await expect(requireCategoryBySlug("nope")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
