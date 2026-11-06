import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  CategoryModel,
  OrderModel,
  ProductModel,
  UserModel,
  type Address,
} from "@/server/models";
import { addToCart } from "./cart";
import {
  categoryInputSchema,
  createCategory,
  createProduct,
  deleteCategory,
  productInputSchema,
  setProductActive,
  updateCategory,
  updateProduct,
} from "./catalog-admin";
import { createOrderFromCart, payOrder } from "./orders";
import {
  ORDER_TRANSITIONS,
  getDashboardStats,
  listAllOrders,
  updateOrderStatus,
} from "./orders-admin";
import { getProductBySlug } from "./products";
import {
  clearDatabase,
  dbReachable,
  setupTestDatabase,
  teardownTestDatabase,
} from "@/test/db";

const ADDRESS: Address = {
  fullName: "Ada Lovelace",
  address: "1 Analytical Way",
  city: "London",
  postalCode: "SW1A 1AA",
  country: "United Kingdom",
};

const VALID_INPUT = {
  name: "Quiet Fan",
  brand: "Hearth",
  description: "A fan.",
  image: "/images/products/fan.svg",
  category: "64b000000000000000000000",
  price: 40,
  countInStock: 2,
};

describe("productInputSchema", () => {
  it.each([
    ["a site path", "/images/a.png"],
    ["an https URL", "https://cdn.example/a.png"],
  ])("accepts %s as an image", (_label, image) => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, image }).success).toBe(true);
  });

  it.each([
    ["javascript:alert(1)"],
    ["data:text/html;base64,AAAA"],
    ["//evil.example/a.png"],
    ["http://insecure.example/a.png"],
    [""],
  ])("refuses %s as an image", (image) => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, image }).success).toBe(false);
  });

  it.each([
    ["a negative price", { price: -1 }],
    ["a NaN price", { price: Number.NaN }],
    ["fractional stock", { countInStock: 1.5 }],
    ["a malformed category", { category: "nope" }],
    ["a slug with spaces", { slug: "two words" }],
  ])("refuses %s", (_label, override) => {
    expect(productInputSchema.safeParse({ ...VALID_INPUT, ...override }).success).toBe(false);
  });
});

describe("categoryInputSchema", () => {
  it.each([["a b"], ["a/b"], ["a?b=c"], ["-a"], ["a--b"], ["x".repeat(121)]])(
    "refuses the slug %s",
    (slug) => {
      expect(categoryInputSchema.safeParse({ name: "A", slug }).success).toBe(false);
    },
  );
});

describe.skipIf(!dbReachable)("admin services", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);

  let categoryId: string;
  let userId: string;

  beforeEach(async () => {
    await clearDatabase();

    const category = await CategoryModel.create({ name: "Audio", slug: "audio" });
    categoryId = String(category._id);

    const user = await UserModel.create({
      name: "Ada",
      email: "ada@example.com",
      password: "correct-horse",
    });
    userId = String(user._id);
  });

  const input = () => ({ ...VALID_INPUT, category: categoryId });

  async function placeOrder(qty = 2) {
    const product = await createProduct({ ...input(), countInStock: 5 });
    await addToCart(userId, String(product._id), qty);
    const order = await createOrderFromCart(userId, {
      shippingAddress: ADDRESS,
      paymentMethod: "test-approve",
    });
    return { orderId: String(order._id), productId: String(product._id) };
  }

  describe("products", () => {
    it("creates with a slug derived from the name", async () => {
      const product = await createProduct(input());

      expect(product.slug).toBe("quiet-fan");
    });

    it("reports a slug collision as a conflict", async () => {
      await createProduct(input());

      await expect(createProduct(input())).rejects.toMatchObject({
        code: "conflict",
      });
    });

    it("refuses a department that does not exist", async () => {
      await expect(
        createProduct({ ...input(), category: "64b000000000000000000000" }),
      ).rejects.toMatchObject({ code: "validation" });
    });

    it("updates only the given fields", async () => {
      const product = await createProduct(input());

      const updated = await updateProduct(String(product._id), { price: 55 });

      expect(updated).toMatchObject({ price: 55, name: "Quiet Fan" });
    });

    it("gives not_found for a malformed id", async () => {
      await expect(updateProduct("nope", { price: 1 })).rejects.toMatchObject({
        code: "not_found",
      });
    });

    it("withdraws from the shop and returns to it", async () => {
      const product = await createProduct(input());

      await setProductActive(String(product._id), false);
      await expect(getProductBySlug("quiet-fan")).resolves.toBeNull();

      await setProductActive(String(product._id), true);
      await expect(getProductBySlug("quiet-fan")).resolves.not.toBeNull();
    });
  });

  describe("categories", () => {
    it("reports a duplicate as a conflict", async () => {
      await expect(createCategory({ name: "Audio" })).rejects.toMatchObject({
        code: "conflict",
      });
    });

    it("renames", async () => {
      const updated = await updateCategory(categoryId, { name: "Sound" });

      expect(updated.name).toBe("Sound");
    });

    it("refuses to delete a department with products", async () => {
      await createProduct(input());

      await expect(deleteCategory(categoryId)).rejects.toMatchObject({
        code: "conflict",
      });
      await expect(CategoryModel.countDocuments()).resolves.toBe(1);
    });

    it("counts withdrawn products as still using the department", async () => {
      const product = await createProduct(input());
      await setProductActive(String(product._id), false);

      await expect(deleteCategory(categoryId)).rejects.toMatchObject({
        code: "conflict",
      });
    });

    it("deletes an empty department", async () => {
      await deleteCategory(categoryId);

      await expect(CategoryModel.countDocuments()).resolves.toBe(0);
    });
  });

  describe("updateOrderStatus", () => {
    it("walks an order through to delivered", async () => {
      const { orderId } = await placeOrder();

      await updateOrderStatus(orderId, "paid");
      await updateOrderStatus(orderId, "shipped");
      const delivered = await updateOrderStatus(orderId, "delivered");

      expect(delivered).toMatchObject({
        status: "delivered",
        isPaid: true,
        isDelivered: true,
      });
      expect(delivered.deliveredAt).toBeInstanceOf(Date);
    });

    it("records a hand-marked payment as manual", async () => {
      const { orderId } = await placeOrder();

      const paid = await updateOrderStatus(orderId, "paid");

      expect(paid.paymentResult?.provider).toBe("manual");
    });

    it.each([
      ["pending", "shipped"],
      ["pending", "delivered"],
    ] as const)("refuses %s to %s", async (_from, to) => {
      const { orderId } = await placeOrder();

      await expect(updateOrderStatus(orderId, to)).rejects.toMatchObject({
        code: "conflict",
      });
    });

    it("refuses to move a finished order", async () => {
      const { orderId } = await placeOrder();
      await updateOrderStatus(orderId, "cancelled");

      await expect(updateOrderStatus(orderId, "paid")).rejects.toMatchObject({
        code: "conflict",
      });
    });

    it("offers no move out of delivered or cancelled", () => {
      expect(ORDER_TRANSITIONS.delivered).toEqual([]);
      expect(ORDER_TRANSITIONS.cancelled).toEqual([]);
    });

    it("returns stock when an order is cancelled", async () => {
      const { orderId, productId } = await placeOrder(2);
      expect((await ProductModel.findById(productId).lean())?.countInStock).toBe(3);

      await updateOrderStatus(orderId, "cancelled");

      expect((await ProductModel.findById(productId).lean())?.countInStock).toBe(5);
    });

    it("returns stock once when two admins cancel together", async () => {
      const { orderId, productId } = await placeOrder(2);

      const results = await Promise.allSettled([
        updateOrderStatus(orderId, "cancelled"),
        updateOrderStatus(orderId, "cancelled"),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await ProductModel.findById(productId).lean())?.countInStock).toBe(5);
    });

    it("marks a cancelled paid order as refunded", async () => {
      const { orderId } = await placeOrder();
      await payOrder(orderId, userId, { paymentMethod: "test-approve" });

      const cancelled = await updateOrderStatus(orderId, "cancelled");

      expect(cancelled.paymentResult?.status).toBe("refunded");
    });

    it("gives not_found for a malformed id", async () => {
      await expect(updateOrderStatus("nope", "paid")).rejects.toMatchObject({
        code: "not_found",
      });
    });
  });

  describe("listAllOrders", () => {
    it("shows the customer and filters by status", async () => {
      const { orderId } = await placeOrder();

      const pending = await listAllOrders({ status: "pending" });
      expect(pending.items[0]).toMatchObject({
        id: orderId,
        customerName: "Ada",
        customerEmail: "ada@example.com",
      });

      await expect(listAllOrders({ status: "paid" })).resolves.toMatchObject({
        total: 0,
      });
    });

    it("keeps an order whose account was deleted", async () => {
      await placeOrder();
      await UserModel.deleteMany({});

      const { items } = await listAllOrders();

      expect(items[0].customerName).toBe("Deleted account");
    });
  });

  describe("getDashboardStats", () => {
    it("counts revenue from paid orders only, excluding cancelled", async () => {
      const first = await placeOrder(1);
      await payOrder(first.orderId, userId, { paymentMethod: "test-approve" });

      await CategoryModel.create({ name: "Other", slug: "other" });
      const second = await createProduct({
        ...input(),
        name: "Second",
        price: 200,
        countInStock: 3,
      });
      await addToCart(userId, String(second._id), 1);
      const pending = await createOrderFromCart(userId, {
        shippingAddress: ADDRESS,
        paymentMethod: "test-approve",
      });

      const stats = await getDashboardStats();

      const firstTotal = (await OrderModel.findById(first.orderId).lean())?.totalPrice;
      expect(stats.revenue).toBe(firstTotal);
      expect(stats).toMatchObject({ orderCount: 2, toShip: 1, awaitingPayment: 1 });

      await updateOrderStatus(first.orderId, "cancelled");
      await updateOrderStatus(String(pending._id), "cancelled");

      await expect(getDashboardStats()).resolves.toMatchObject({ revenue: 0 });
    });

    it("lists low stock, leaving out withdrawn products", async () => {
      await createProduct({ ...input(), name: "Scarce", countInStock: 1 });
      await createProduct({ ...input(), name: "Plenty", countInStock: 50 });
      const gone = await createProduct({ ...input(), name: "Gone", countInStock: 0 });
      await setProductActive(String(gone._id), false);

      const { lowStock } = await getDashboardStats();

      expect(lowStock.map((product) => product.name)).toEqual(["Scarce"]);
    });
  });
});
