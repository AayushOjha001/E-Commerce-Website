import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  CartModel,
  CategoryModel,
  OrderModel,
  ProductModel,
  UserModel,
  slugify,
  type UserRole,
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

describe.skipIf(!dbReachable)("models", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);
  beforeEach(clearDatabase);

  async function makeCategory(name = "Audio") {
    return CategoryModel.create({ name });
  }

  async function makeProduct(overrides: Record<string, unknown> = {}) {
    const category = await makeCategory(`Cat-${Math.random()}`);
    return ProductModel.create({
      name: "Test Widget",
      image: "/images/widget.svg",
      description: "A widget for testing",
      brand: "ACME",
      category: category._id,
      price: 19.99,
      countInStock: 5,
      ...overrides,
    });
  }

  describe("User", () => {
    it("hashes the password on create and never returns it by default", async () => {
      const user = await UserModel.create({
        name: "Ada",
        email: "ada@example.com",
        password: "correct horse battery",
      });

      expect(user.password).not.toBe("correct horse battery");
      expect(user.password).toMatch(/^\$2[aby]\$/);

      // select: false means a plain query must not expose the hash.
      const fetched = await UserModel.findById(user._id).lean();
      expect(fetched?.password).toBeUndefined();
    });

    it("matches a correct password and rejects a wrong one", async () => {
      await UserModel.create({
        name: "Ada",
        email: "ada@example.com",
        password: "secret123",
      });

      const user = await UserModel.findOne({ email: "ada@example.com" }).select(
        "+password",
      );

      await expect(user!.matchPassword("secret123")).resolves.toBe(true);
      await expect(user!.matchPassword("wrong")).resolves.toBe(false);
    });

    it("fails closed when the hash was not selected", async () => {
      await UserModel.create({
        name: "Ada",
        email: "ada@example.com",
        password: "secret123",
      });

      // No "+password": matchPassword must not throw inside bcrypt.
      const user = await UserModel.findOne({ email: "ada@example.com" });

      await expect(user!.matchPassword("secret123")).resolves.toBe(false);
    });

    it("does NOT re-hash an unchanged password on later saves (audit B9)", async () => {
      const user = await UserModel.create({
        name: "Ada",
        email: "ada@example.com",
        password: "secret123",
      });
      const firstHash = user.password;

      user.name = "Ada Lovelace";
      await user.save();

      expect(user.password).toBe(firstHash);

      // The real symptom of B9: login breaks after an unrelated profile update.
      const reloaded = await UserModel.findById(user._id).select("+password");
      await expect(reloaded!.matchPassword("secret123")).resolves.toBe(true);
    });

    it("re-hashes when the password actually changes", async () => {
      const user = await UserModel.create({
        name: "Ada",
        email: "ada@example.com",
        password: "secret123",
      });
      const firstHash = user.password;

      user.password = "a-new-password";
      await user.save();

      expect(user.password).not.toBe(firstHash);
      await expect(user.matchPassword("a-new-password")).resolves.toBe(true);
      await expect(user.matchPassword("secret123")).resolves.toBe(false);
    });

    it("normalises email and enforces uniqueness", async () => {
      const user = await UserModel.create({
        name: "Ada",
        email: "  ADA@Example.COM ",
        password: "secret123",
      });

      expect(user.email).toBe("ada@example.com");

      // Uniqueness relies on the index, which setupTestDatabase built.
      await expect(
        UserModel.create({
          name: "Impostor",
          email: "ada@example.com",
          password: "secret123",
        }),
      ).rejects.toThrow(/duplicate key|E11000/i);
    });

    it("rejects an invalid email", async () => {
      await expect(
        UserModel.create({
          name: "Ada",
          email: "not-an-email",
          password: "secret123",
        }),
      ).rejects.toThrow(/not valid/i);
    });

    it("defaults to the customer role and rejects unknown roles", async () => {
      const user = await UserModel.create({
        name: "Ada",
        email: "ada@example.com",
        password: "secret123",
      });
      expect(user.role).toBe("customer");

      await expect(
        UserModel.create({
          name: "Root",
          email: "root@example.com",
          password: "secret123",
          // Deliberately invalid: cast so TypeScript allows the call and the
          // runtime enum validation is what gets tested.
          role: "superuser" as UserRole,
        }),
      ).rejects.toThrow(/customer or admin/i);
    });
  });

  describe("Category", () => {
    it("derives a slug from the name", async () => {
      const category = await CategoryModel.create({ name: "Home & Kitchen" });

      expect(category.slug).toBe("home-kitchen");
    });

    it("keeps an explicit slug", async () => {
      const category = await CategoryModel.create({
        name: "Audio",
        slug: "sound",
      });

      expect(category.slug).toBe("sound");
    });

    it("enforces a unique name", async () => {
      await CategoryModel.create({ name: "Audio" });

      await expect(CategoryModel.create({ name: "Audio" })).rejects.toThrow(
        /duplicate key|E11000/i,
      );
    });
  });

  describe("slugify", () => {
    it("handles accents, symbols and spacing", () => {
      expect(slugify("Café  Crème!")).toBe("cafe-creme");
      expect(slugify("  --Hello World--  ")).toBe("hello-world");
      expect(slugify("iPhone 14 Pro")).toBe("iphone-14-pro");
    });
  });

  describe("Product", () => {
    it("stores countInStock as a number, not a string (audit B8)", async () => {
      const product = await makeProduct({ countInStock: "5" });

      expect(product.countInStock).toBe(5);
      expect(typeof product.countInStock).toBe("number");

      // The bug this prevents: with String stock, "10" < "9" compares true.
      const raw = await ProductModel.collection.findOne({ _id: product._id });
      expect(typeof raw?.countInStock).toBe("number");
    });

    it("rejects negative or fractional stock", async () => {
      await expect(makeProduct({ countInStock: -1 })).rejects.toThrow(
        /cannot be negative/i,
      );
      await expect(makeProduct({ countInStock: 1.5 })).rejects.toThrow(
        /whole number/i,
      );
    });

    it("rounds price to 2 decimals on write", async () => {
      const product = await makeProduct({ price: 19.999 });

      expect(product.price).toBe(20);
    });

    it("rejects a negative price", async () => {
      await expect(makeProduct({ price: -5 })).rejects.toThrow(
        /cannot be negative/i,
      );
    });

    it("requires a category reference", async () => {
      await expect(
        ProductModel.create({
          name: "Orphan",
          image: "/i.svg",
          description: "d",
          brand: "b",
          price: 1,
        }),
      ).rejects.toThrow(/category is required/i);
    });

    it("populates its category", async () => {
      const product = await makeProduct();

      const found = await ProductModel.findById(product._id).populate<{
        category: { name: string };
      }>("category");

      expect(found?.category.name).toMatch(/^Cat-/);
    });

    it("defaults to active with zero rating", async () => {
      const product = await makeProduct();

      expect(product.isActive).toBe(true);
      expect(product.rating).toBe(0);
      expect(product.numReviews).toBe(0);
    });

    it("caps rating at 5", async () => {
      await expect(makeProduct({ rating: 6 })).rejects.toThrow(/above 5/i);
    });

    it("supports full-text search", async () => {
      const category = await makeCategory("Search");
      await ProductModel.create([
        {
          name: "Wireless Headphones",
          image: "/a.svg",
          description: "Noise cancelling",
          brand: "Sony",
          category: category._id,
          price: 99,
          countInStock: 3,
        },
        {
          name: "Coffee Grinder",
          image: "/b.svg",
          description: "Burr grinder",
          brand: "Baratza",
          category: category._id,
          price: 149,
          countInStock: 2,
        },
      ]);

      const hits = await ProductModel.find({
        $text: { $search: "headphones" },
      }).lean();

      expect(hits).toHaveLength(1);
      expect(hits[0]!.name).toBe("Wireless Headphones");
    });
  });

  describe("Cart", () => {
    it("has createdAt/updatedAt (audit B10 timestamps typo)", async () => {
      const user = await UserModel.create({
        name: "Ada",
        email: "ada@example.com",
        password: "secret123",
      });

      const cart = await CartModel.create({ user: user._id, items: [] });

      expect(cart.createdAt).toBeInstanceOf(Date);
      expect(cart.updatedAt).toBeInstanceOf(Date);
    });

    it("allows only one cart per user", async () => {
      const user = await UserModel.create({
        name: "Ada",
        email: "ada@example.com",
        password: "secret123",
      });
      await CartModel.create({ user: user._id, items: [] });

      await expect(CartModel.create({ user: user._id, items: [] })).rejects.toThrow(
        /duplicate key|E11000/i,
      );
    });

    it("rejects a qty below 1 or fractional", async () => {
      const user = await UserModel.create({
        name: "Ada",
        email: "ada@example.com",
        password: "secret123",
      });
      const product = await makeProduct();

      await expect(
        CartModel.create({
          user: user._id,
          items: [{ product: product._id, qty: 0 }],
        }),
      ).rejects.toThrow(/at least 1/i);

      await expect(
        CartModel.create({
          user: user._id,
          items: [{ product: product._id, qty: 2.5 }],
        }),
      ).rejects.toThrow(/whole number/i);
    });

    it("defaults items to an empty array", async () => {
      const user = await UserModel.create({
        name: "Ada",
        email: "ada@example.com",
        password: "secret123",
      });

      const cart = await CartModel.create({ user: user._id });

      expect(cart.items).toEqual([]);
    });
  });

  describe("Order", () => {
    async function orderFixture(overrides: Record<string, unknown> = {}) {
      const user = await UserModel.create({
        name: "Ada",
        email: `ada-${Math.random()}@example.com`,
        password: "secret123",
      });
      const product = await makeProduct();

      return OrderModel.create({
        user: user._id,
        orderItems: [
          {
            name: product.name,
            qty: 2,
            image: product.image,
            price: product.price,
            product: product._id,
          },
        ],
        shippingAddress: {
          fullName: "Ada Lovelace",
          address: "1 Analytical Way",
          city: "London",
          postalCode: "E1 6AN",
          country: "UK",
        },
        paymentMethod: "mock",
        itemsPrice: 39.98,
        taxPrice: 0,
        shippingPrice: 0,
        totalPrice: 39.98,
        ...overrides,
      });
    }

    it("saves a server-built order", async () => {
      const order = await orderFixture();

      expect(order.status).toBe("pending");
      expect(order.isPaid).toBe(false);
      expect(order.isDelivered).toBe(false);
      expect(order.totalPrice).toBe(39.98);
    });

    it("requires image on each line item (audit B11 contract)", async () => {
      // The legacy controller built line items without `image`, so a
      // server-built order could never validate. This pins the contract the
      // order service must satisfy.
      const user = await UserModel.create({
        name: "Ada",
        email: "ada@example.com",
        password: "secret123",
      });
      const product = await makeProduct();

      await expect(
        OrderModel.create({
          user: user._id,
          orderItems: [
            {
              name: product.name,
              qty: 1,
              price: product.price,
              product: product._id,
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
        }),
      ).rejects.toThrow(/image is required/i);
    });

    it("rejects an order with no items", async () => {
      await expect(orderFixture({ orderItems: [] })).rejects.toThrow(
        /at least one item/i,
      );
    });

    it("requires a shipping address", async () => {
      await expect(orderFixture({ shippingAddress: undefined })).rejects.toThrow(
        /shipping address is required/i,
      );
    });

    it("requires each shipping address field", async () => {
      await expect(
        orderFixture({
          shippingAddress: { fullName: "Ada", city: "London" },
        }),
      ).rejects.toThrow(/required/i);
    });

    it("defaults the money fields to 0 rather than leaving them unset", async () => {
      const order = await orderFixture({
        itemsPrice: undefined,
        taxPrice: undefined,
        shippingPrice: undefined,
        totalPrice: undefined,
      });

      expect(order.itemsPrice).toBe(0);
      expect(order.taxPrice).toBe(0);
      expect(order.shippingPrice).toBe(0);
      expect(order.totalPrice).toBe(0);
    });

    it("rounds money fields to 2 decimals", async () => {
      const order = await orderFixture({ totalPrice: 39.987 });

      expect(order.totalPrice).toBe(39.99);
    });

    it("rejects an unknown status", async () => {
      await expect(orderFixture({ status: "refunded" })).rejects.toThrow(
        /unknown order status/i,
      );
    });

    it("keeps line items as snapshots, unaffected by later product edits", async () => {
      const order = await orderFixture();
      const productId = order.orderItems[0]!.product;

      await ProductModel.findByIdAndUpdate(productId, {
        name: "Renamed",
        price: 999,
      });

      const reloaded = await OrderModel.findById(order._id).lean();

      expect(reloaded!.orderItems[0]!.name).toBe("Test Widget");
      expect(reloaded!.orderItems[0]!.price).toBe(19.99);
    });
  });
});
