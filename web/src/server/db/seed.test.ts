import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SEED_PASSWORD, seed } from "@/server/db/seed";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "@/server/db/seed-data";
import {
  CategoryModel,
  ProductModel,
  UserModel,
} from "@/server/models";
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

describe.skipIf(!dbReachable)("seed", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);
  beforeEach(clearDatabase);

  it("creates the documented catalog and users", async () => {
    const result = await seed({ quiet: true });

    expect(result).toEqual({
      categories: SEED_CATEGORIES.length,
      products: SEED_PRODUCTS.length,
      users: 2,
    });
    await expect(CategoryModel.countDocuments()).resolves.toBe(
      SEED_CATEGORIES.length,
    );
    await expect(ProductModel.countDocuments()).resolves.toBe(
      SEED_PRODUCTS.length,
    );
    await expect(UserModel.countDocuments()).resolves.toBe(2);
  });

  it("is idempotent — reseeding does not duplicate anything", async () => {
    await seed({ quiet: true });
    await seed({ quiet: true });
    await seed({ quiet: true });

    await expect(CategoryModel.countDocuments()).resolves.toBe(
      SEED_CATEGORIES.length,
    );
    await expect(ProductModel.countDocuments()).resolves.toBe(
      SEED_PRODUCTS.length,
    );
    await expect(UserModel.countDocuments()).resolves.toBe(2);
  });

  it("hashes seeded passwords, and they still verify after a reseed", async () => {
    await seed({ quiet: true });
    await seed({ quiet: true });

    const user = await UserModel.findOne({
      email: "customer@example.com",
    }).select("+password");

    expect(user!.password).toMatch(/^\$2[aby]\$/);
    // Would fail if the reseed double-hashed (audit B9) or wrote plaintext.
    await expect(user!.matchPassword(DEFAULT_SEED_PASSWORD)).resolves.toBe(true);
  });

  it("gives the admin account the admin role", async () => {
    await seed({ quiet: true });

    const admin = await UserModel.findOne({ email: "admin@example.com" });
    const customer = await UserModel.findOne({ email: "customer@example.com" });

    expect(admin!.role).toBe("admin");
    expect(customer!.role).toBe("customer");
  });

  it("links every product to a real category", async () => {
    await seed({ quiet: true });

    const products = await ProductModel.find().populate<{
      category: { slug: string } | null;
    }>("category");

    expect(products).toHaveLength(SEED_PRODUCTS.length);
    for (const product of products) {
      expect(product.category).not.toBeNull();
    }
  });

  it("stores stock as numbers, including the deliberate out-of-stock item", async () => {
    await seed({ quiet: true });

    const outOfStock = await ProductModel.findOne({
      slug: "nimbus-5-pro-smartphone",
    });

    expect(outOfStock!.countInStock).toBe(0);
    for (const product of await ProductModel.find().lean()) {
      expect(typeof product.countInStock).toBe("number");
    }
  });

  it("points every product at a committed local image", async () => {
    await seed({ quiet: true });

    for (const product of await ProductModel.find().lean()) {
      // Not via.placeholder.com, which the legacy app used and which no longer
      // resolves reliably.
      expect(product.image).toMatch(/^\/images\/products\/[a-z0-9-]+\.svg$/);
    }
  });

  it("refuses to run against NODE_ENV=production without an explicit override", async () => {
    // NODE_ENV is typed readonly by Next.js, so go through a widened view of
    // process.env rather than assigning to it directly.
    const env = process.env as Record<string, string | undefined>;
    const savedNodeEnv = env.NODE_ENV;
    const savedOverride = env.ALLOW_PRODUCTION_SEED;
    env.NODE_ENV = "production";
    delete env.ALLOW_PRODUCTION_SEED;

    try {
      await expect(seed({ quiet: true })).rejects.toThrow(/Refusing to seed/i);
      await expect(UserModel.countDocuments()).resolves.toBe(0);
    } finally {
      env.NODE_ENV = savedNodeEnv;
      if (savedOverride !== undefined) {
        env.ALLOW_PRODUCTION_SEED = savedOverride;
      }
    }
  });
});
