import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CategoryModel, ProductModel } from "@/server/models";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  getProductById,
  getProductBySlug,
  listProducts,
  requireProductById,
} from "./products";
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

describe.skipIf(!dbReachable)("products service", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);

  let audioId: Types.ObjectId;
  let computersId: Types.ObjectId;

  beforeEach(async () => {
    await clearDatabase();

    const [audio, computers] = await CategoryModel.create([
      { name: "Audio", slug: "audio" },
      { name: "Computers", slug: "computers" },
    ]);
    audioId = audio._id;
    computersId = computers._id;

    await ProductModel.create([
      {
        name: "Aurora Headphones",
        slug: "aurora-headphones",
        image: "/a.svg",
        description: "Noise cancelling over-ear",
        brand: "Soniq",
        category: audioId,
        price: 199.99,
        countInStock: 5,
        rating: 4.6,
        numReviews: 10,
      },
      {
        name: "Pulse Speaker",
        slug: "pulse-speaker",
        image: "/b.svg",
        description: "Portable bluetooth speaker",
        brand: "Soniq",
        category: audioId,
        price: 89.5,
        countInStock: 9,
        rating: 4.1,
        numReviews: 4,
      },
      {
        name: "Meridian Laptop",
        slug: "meridian-laptop",
        image: "/c.svg",
        description: "Ultraportable laptop",
        brand: "Northwind",
        category: computersId,
        price: 1299,
        countInStock: 2,
        rating: 4.9,
        numReviews: 30,
      },
      {
        name: "Retired Widget",
        slug: "retired-widget",
        image: "/d.svg",
        description: "No longer sold",
        brand: "ACME",
        category: computersId,
        price: 10,
        countInStock: 0,
        isActive: false,
      },
    ]);
  });

  describe("listProducts", () => {
    it("returns only active products by default", async () => {
      const result = await listProducts();

      expect(result.total).toBe(3);
      expect(result.items.map((p) => p.slug)).not.toContain("retired-widget");
    });

    it("can include inactive products for admin listings", async () => {
      const result = await listProducts({ includeInactive: true });

      expect(result.total).toBe(4);
    });

    it("populates the category", async () => {
      const result = await listProducts({ sort: "price-asc" });

      expect(result.items[0]!.category).toMatchObject({
        name: "Audio",
        slug: "audio",
      });
    });

    it("paginates and reports page metadata", async () => {
      const first = await listProducts({ limit: 2, page: 1, sort: "price-asc" });

      expect(first.items).toHaveLength(2);
      expect(first.total).toBe(3);
      expect(first.totalPages).toBe(2);
      expect(first.hasPrevious).toBe(false);
      expect(first.hasNext).toBe(true);

      const second = await listProducts({ limit: 2, page: 2, sort: "price-asc" });

      expect(second.items).toHaveLength(1);
      expect(second.hasPrevious).toBe(true);
      expect(second.hasNext).toBe(false);
    });

    it("does not overlap items across pages", async () => {
      const a = await listProducts({ limit: 2, page: 1, sort: "price-asc" });
      const b = await listProducts({ limit: 2, page: 2, sort: "price-asc" });

      const slugs = [...a.items, ...b.items].map((p) => p.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it("defaults to page 1 with the default page size", async () => {
      const result = await listProducts();

      expect(result.page).toBe(1);
      expect(result.limit).toBe(DEFAULT_PAGE_SIZE);
    });

    it("clamps a hostile limit and a nonsense page", async () => {
      const huge = await listProducts({ limit: 1_000_000 });
      expect(huge.limit).toBe(MAX_PAGE_SIZE);

      const zero = await listProducts({ limit: 0, page: 0 });
      expect(zero.limit).toBe(1);
      expect(zero.page).toBe(1);

      const negative = await listProducts({ page: -5 });
      expect(negative.page).toBe(1);
    });

    it("filters by category slug", async () => {
      const result = await listProducts({ category: "audio" });

      expect(result.total).toBe(2);
      expect(result.items.every((p) => p.category?.slug === "audio")).toBe(true);
    });

    it("is case-insensitive on the category slug", async () => {
      const result = await listProducts({ category: "AUDIO" });

      expect(result.total).toBe(2);
    });

    it("returns an empty page for an unknown category, not the whole catalog", async () => {
      const result = await listProducts({ category: "does-not-exist" });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it("searches names, brands and descriptions", async () => {
      await expect(
        listProducts({ search: "headphones" }).then((r) => r.total),
      ).resolves.toBe(1);

      // Brand match.
      await expect(
        listProducts({ search: "Northwind" }).then((r) => r.total),
      ).resolves.toBe(1);

      // Description match.
      await expect(
        listProducts({ search: "bluetooth" }).then((r) => r.total),
      ).resolves.toBe(1);
    });

    it("returns nothing for a search with no matches", async () => {
      const result = await listProducts({ search: "zzzznomatch" });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("ignores a whitespace-only search", async () => {
      const result = await listProducts({ search: "   " });

      expect(result.total).toBe(3);
    });

    it("filters by price range", async () => {
      await expect(
        listProducts({ minPrice: 100 }).then((r) => r.total),
      ).resolves.toBe(2);
      await expect(
        listProducts({ maxPrice: 100 }).then((r) => r.total),
      ).resolves.toBe(1);
      await expect(
        listProducts({ minPrice: 50, maxPrice: 200 }).then((r) => r.total),
      ).resolves.toBe(2);
    });

    it("sorts by price ascending and descending", async () => {
      const asc = await listProducts({ sort: "price-asc" });
      const desc = await listProducts({ sort: "price-desc" });

      expect(asc.items.map((p) => p.price)).toEqual([89.5, 199.99, 1299]);
      expect(desc.items.map((p) => p.price)).toEqual([1299, 199.99, 89.5]);
    });

    it("sorts by rating", async () => {
      const result = await listProducts({ sort: "rating" });

      expect(result.items[0]!.slug).toBe("meridian-laptop");
    });

    it("sorts by newest by default", async () => {
      const result = await listProducts();

      // Created last of the active three.
      expect(result.items[0]!.slug).toBe("meridian-laptop");
    });

    it("falls back to newest for relevance sort without a search term", async () => {
      const result = await listProducts({ sort: "relevance" });

      expect(result.items).toHaveLength(3);
      expect(result.items[0]!.slug).toBe("meridian-laptop");
    });

    it("combines search with a category filter", async () => {
      // Discriminating case: "Soniq" alone matches 2, both in audio. Asking for
      // Soniq *in computers* must be 0 — a test that only checked the audio
      // combination would pass even with the category filter dropped.
      await expect(
        listProducts({ search: "Soniq", category: "computers" }).then(
          (r) => r.total,
        ),
      ).resolves.toBe(0);

      await expect(
        listProducts({ search: "Soniq", category: "audio" }).then((r) => r.total),
      ).resolves.toBe(2);

      await expect(
        listProducts({ search: "Northwind", category: "computers" }).then(
          (r) => r.total,
        ),
      ).resolves.toBe(1);
    });

    it("falls back to defaults for NaN paging instead of returning everything", async () => {
      // NaN survives Math.trunc/min/max, and Mongo reads .limit(NaN) as "no
      // limit" — so a missing guard silently dumps the whole collection and
      // leaks limit/totalPages as null through JSON.
      const result = await listProducts({ limit: Number.NaN, page: Number.NaN });

      expect(result.limit).toBe(DEFAULT_PAGE_SIZE);
      expect(result.page).toBe(1);
      expect(Number.isFinite(result.totalPages)).toBe(true);
      expect(JSON.parse(JSON.stringify(result)).limit).toBe(DEFAULT_PAGE_SIZE);
    });

    it("rejects a non-numeric or negative price bound as a validation error", async () => {
      // Must be a ServiceError, not a raw Mongoose CastError surfacing as a 500.
      for (const options of [
        { minPrice: Number.NaN },
        { maxPrice: Number.NaN },
        { minPrice: Number.POSITIVE_INFINITY },
        { minPrice: -1 },
      ]) {
        await expect(listProducts(options)).rejects.toMatchObject({
          code: "validation",
        });
      }
    });

    it("rejects an inverted price range", async () => {
      await expect(
        listProducts({ minPrice: 100, maxPrice: 10 }),
      ).rejects.toMatchObject({ code: "validation" });
    });

    it("validates the price range even when the category is unknown", async () => {
      // The validation must not be skipped by the unknown-category early return.
      await expect(
        listProducts({ minPrice: Number.NaN, category: "does-not-exist" }),
      ).rejects.toMatchObject({ code: "validation" });
    });

    it("reports an out-of-range page as empty without error", async () => {
      const result = await listProducts({ page: 99 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(3);
      expect(result.hasNext).toBe(false);
    });
  });

  describe("getProductById", () => {
    it("finds an active product", async () => {
      const seeded = await ProductModel.findOne({ slug: "aurora-headphones" });

      const product = await getProductById(String(seeded!._id));

      expect(product?.slug).toBe("aurora-headphones");
      expect(product?.category).toMatchObject({ slug: "audio" });
    });

    it("returns null for a valid-but-missing id", async () => {
      await expect(
        getProductById(String(new Types.ObjectId())),
      ).resolves.toBeNull();
    });

    it("returns null for a malformed id instead of throwing CastError", async () => {
      // A hand-typed URL must produce a clean 404, not a 500.
      await expect(getProductById("not-an-objectid")).resolves.toBeNull();
      await expect(getProductById("")).resolves.toBeNull();
    });

    it("hides inactive products unless asked", async () => {
      const retired = await ProductModel.findOne({ slug: "retired-widget" });

      await expect(getProductById(String(retired!._id))).resolves.toBeNull();
      await expect(
        getProductById(String(retired!._id), { includeInactive: true }),
      ).resolves.not.toBeNull();
    });
  });

  describe("requireProductById", () => {
    it("throws not_found rather than returning null", async () => {
      await expect(
        requireProductById(String(new Types.ObjectId())),
      ).rejects.toMatchObject({ code: "not_found" });

      await expect(requireProductById("garbage")).rejects.toMatchObject({
        code: "not_found",
      });
    });
  });

  describe("getProductBySlug", () => {
    it("finds by slug, case-insensitively", async () => {
      await expect(
        getProductBySlug("AURORA-HEADPHONES").then((p) => p?.slug),
      ).resolves.toBe("aurora-headphones");
    });

    it("returns null for an unknown slug", async () => {
      await expect(getProductBySlug("nope")).resolves.toBeNull();
    });

    it("hides inactive products unless asked", async () => {
      await expect(getProductBySlug("retired-widget")).resolves.toBeNull();
      await expect(
        getProductBySlug("retired-widget", { includeInactive: true }),
      ).resolves.not.toBeNull();
    });
  });
});
