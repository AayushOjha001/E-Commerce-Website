import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resetEnvCache } from "@/lib/env";
import { DEFAULT_SEED_PASSWORD, seed } from "@/server/db/seed";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "@/server/db/seed-data";
import {
  CartModel,
  CategoryModel,
  OrderModel,
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

  it("leaves carts and orders alone by default", async () => {
    await seed({ quiet: true });

    const user = await UserModel.findOne({ email: "customer@example.com" });
    await CartModel.create({ user: user!._id, items: [] });

    await seed({ quiet: true });

    await expect(CartModel.countDocuments()).resolves.toBe(1);
  });

  it("clears carts and orders with reset: true", async () => {
    await seed({ quiet: true });

    const user = await UserModel.findOne({ email: "customer@example.com" });
    const product = await ProductModel.findOne({
      slug: "aurora-wireless-headphones",
    });
    await CartModel.create({
      user: user!._id,
      items: [{ product: product!._id, qty: 1 }],
    });
    await OrderModel.create({
      user: user!._id,
      orderItems: [
        {
          name: product!.name,
          qty: 1,
          image: product!.image,
          price: product!.price,
          product: product!._id,
        },
      ],
      shippingAddress: {
        fullName: "Ada",
        address: "1 St",
        city: "London",
        postalCode: "E1",
        country: "UK",
      },
      paymentMethod: "mock",
    });

    await seed({ quiet: true, reset: true });

    await expect(CartModel.countDocuments()).resolves.toBe(0);
    await expect(OrderModel.countDocuments()).resolves.toBe(0);
    // The catalog and the users survive a reset.
    await expect(ProductModel.countDocuments()).resolves.toBe(
      SEED_PRODUCTS.length,
    );
    await expect(UserModel.countDocuments()).resolves.toBe(2);
  });

  it("does not reset an existing password unless asked", async () => {
    await seed({ quiet: true });

    // Simulate a developer changing the demo password locally.
    const user = await UserModel.findOne({ email: "customer@example.com" });
    user!.password = "locally-changed-password";
    await user!.save();

    await seed({ quiet: true });

    const after = await UserModel.findOne({
      email: "customer@example.com",
    }).select("+password");
    await expect(
      after!.matchPassword("locally-changed-password"),
    ).resolves.toBe(true);
  });

  it("resets passwords when SEED_RESET_PASSWORDS=1", async () => {
    const env = process.env as Record<string, string | undefined>;
    await seed({ quiet: true });

    const user = await UserModel.findOne({ email: "customer@example.com" });
    user!.password = "locally-changed-password";
    await user!.save();

    env.SEED_RESET_PASSWORDS = "1";
    try {
      await seed({ quiet: true });
    } finally {
      delete env.SEED_RESET_PASSWORDS;
    }

    const after = await UserModel.findOne({
      email: "customer@example.com",
    }).select("+password");
    await expect(after!.matchPassword(DEFAULT_SEED_PASSWORD)).resolves.toBe(
      true,
    );
  });

  it("refuses to seed a non-local database", async () => {

    // The guard inspects the target host, not NODE_ENV: tsx sets no NODE_ENV, so
    // a NODE_ENV-based guard never fired for `npm run seed` at all.
    const env = process.env as Record<string, string | undefined>;
    const savedUri = env.MONGODB_URI;

    env.MONGODB_URI = "mongodb://prod-cluster.example.com:27017/shop";
    resetEnvCache();
    try {
      await expect(seed({ quiet: true })).rejects.toThrow(/non-local database/i);
      // Nothing was written.
      await expect(UserModel.countDocuments()).resolves.toBe(0);
      await expect(ProductModel.countDocuments()).resolves.toBe(0);
    } finally {
      env.MONGODB_URI = savedUri;
      resetEnvCache();
    }
  });

  it("refuses a mongodb+srv URI, which always means a hosted cluster", async () => {
    const env = process.env as Record<string, string | undefined>;
    const savedUri = env.MONGODB_URI;

    env.MONGODB_URI = "mongodb+srv://user:pw@cluster0.abcd.mongodb.net/shop";
    resetEnvCache();
    try {
      await expect(seed({ quiet: true })).rejects.toThrow(/non-local database/i);
    } finally {
      env.MONGODB_URI = savedUri;
      resetEnvCache();
    }
  });

  it("allows a non-local target only with ALLOW_REMOTE_SEED=1", async () => {
    const env = process.env as Record<string, string | undefined>;
    const savedUri = env.MONGODB_URI;

    // Non-local target with the override set: the guard must not be what stops
    // it. Connecting then fails, which is not the guard we are testing.
    env.MONGODB_URI = "mongodb://prod-cluster.example.com:27017/shop";
    env.ALLOW_REMOTE_SEED = "1";
    resetEnvCache();
    try {
      let message = "";
      try {
        await seed({ quiet: true });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).not.toMatch(/non-local database/i);
    } finally {
      delete env.ALLOW_REMOTE_SEED;
      env.MONGODB_URI = savedUri;
      resetEnvCache();
    }
  });
});
