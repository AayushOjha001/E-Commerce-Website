import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  CartModel,
  CategoryModel,
  OrderModel,
  ProductModel,
  UserModel,
  type Address,
} from "@/server/models";
import { addToCart, getCart, setCartItemQty } from "./cart";
import { MAX_UNPAID_ORDERS, createOrderFromCart, listOrdersForUser, payOrder } from "./orders";
import {
  UNPAID_ORDER_TTL_MINUTES,
  cancelOwnOrder,
  releaseExpiredOrders,
  updateOrderStatus,
} from "./orders-admin";
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

const INPUT = { shippingAddress: ADDRESS, paymentMethod: "test-approve" };

describe.skipIf(!dbReachable)("order lifecycle", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);

  let userId: string;
  let otherId: string;
  let productId: string;

  beforeEach(async () => {
    await clearDatabase();

    const [user, other] = await UserModel.create([
      { name: "Ada", email: "ada@example.com", password: "correct-horse" },
      { name: "Eve", email: "eve@example.com", password: "correct-horse" },
    ]);
    userId = String(user._id);
    otherId = String(other._id);

    const category = await CategoryModel.create({ name: "Audio", slug: "audio" });
    const product = await ProductModel.create({
      name: "Speaker",
      image: "/images/products/x.svg",
      description: "A speaker.",
      brand: "Soniq",
      price: 50,
      countInStock: 10,
      category: category._id,
    });
    productId = String(product._id);
  });

  const stock = async () =>
    (await ProductModel.findById(productId).lean())?.countInStock;

  async function placeOrder(qty = 2) {
    await addToCart(userId, productId, qty);
    return String((await createOrderFromCart(userId, INPUT))._id);
  }

  /** Writes around Mongoose, which protects `createdAt` from being changed. */
  const age = (orderId: string, minutes: number) =>
    OrderModel.collection.updateOne(
      { _id: new Types.ObjectId(orderId) },
      { $set: { createdAt: new Date(Date.now() - minutes * 60 * 1000) } },
    );

  describe("releaseExpiredOrders", () => {
    it("cancels an old unpaid order and returns its stock", async () => {
      const orderId = await placeOrder(2);
      expect(await stock()).toBe(8);
      await age(orderId, UNPAID_ORDER_TTL_MINUTES + 1);

      await expect(releaseExpiredOrders()).resolves.toBe(1);

      expect(await stock()).toBe(10);
      await expect(OrderModel.findById(orderId).lean()).resolves.toMatchObject({
        status: "cancelled",
      });
    });

    it("leaves a recent order alone", async () => {
      await placeOrder();

      await expect(releaseExpiredOrders()).resolves.toBe(0);
      expect(await stock()).toBe(8);
    });

    it("leaves an old paid order alone", async () => {
      const orderId = await placeOrder();
      await payOrder(orderId, userId, { paymentMethod: "test-approve" });
      await age(orderId, UNPAID_ORDER_TTL_MINUTES + 1);

      await expect(releaseExpiredOrders()).resolves.toBe(0);
    });

    it("skips an order whose payment is in progress", async () => {
      const orderId = await placeOrder();
      await age(orderId, UNPAID_ORDER_TTL_MINUTES + 1);
      await OrderModel.updateOne(
        { _id: orderId },
        {
          "paymentResult.status": "processing",
          "paymentResult.updateTime": new Date().toISOString(),
        },
      );

      await expect(releaseExpiredOrders()).resolves.toBe(0);
      expect(await stock()).toBe(8);
    });

    it("does not restock twice when run twice", async () => {
      const orderId = await placeOrder();
      await age(orderId, UNPAID_ORDER_TTL_MINUTES + 1);

      await releaseExpiredOrders();
      await releaseExpiredOrders();

      expect(await stock()).toBe(10);
    });
  });

  describe("cancelOwnOrder", () => {
    it("cancels an unpaid order and returns its stock", async () => {
      const orderId = await placeOrder();

      await cancelOwnOrder(orderId, userId);

      expect(await stock()).toBe(10);
    });

    it("refuses someone else's order", async () => {
      const orderId = await placeOrder();

      await expect(cancelOwnOrder(orderId, otherId)).rejects.toMatchObject({
        code: "forbidden",
      });
      expect(await stock()).toBe(8);
    });

    it("refuses a paid order, which needs a refund", async () => {
      const orderId = await placeOrder();
      await payOrder(orderId, userId, { paymentMethod: "test-approve" });

      await expect(cancelOwnOrder(orderId, userId)).rejects.toMatchObject({
        code: "conflict",
      });
    });
  });

  describe("updateOrderStatus during a payment", () => {
    it("will not cancel an order while its money is moving", async () => {
      const orderId = await placeOrder();
      await OrderModel.updateOne(
        { _id: orderId },
        {
          "paymentResult.status": "processing",
          "paymentResult.updateTime": new Date().toISOString(),
        },
      );

      await expect(updateOrderStatus(orderId, "cancelled")).rejects.toMatchObject({
        code: "conflict",
      });
      expect(await stock()).toBe(8);
    });
  });

  describe("createOrderFromCart", () => {
    it("stops one account holding stock in unpaid orders", async () => {
      for (let count = 0; count < MAX_UNPAID_ORDERS; count += 1) {
        await placeOrder(1);
      }
      const before = await stock();

      await addToCart(userId, productId, 1);

      await expect(createOrderFromCart(userId, INPUT)).rejects.toMatchObject({
        code: "conflict",
      });
      expect(await stock()).toBe(before);
    });

    it("does not count paid orders towards the limit", async () => {
      for (let count = 0; count < MAX_UNPAID_ORDERS; count += 1) {
        const orderId = await placeOrder(1);
        await payOrder(orderId, userId, { paymentMethod: "test-approve" });
      }

      await expect(placeOrder(1)).resolves.toBeDefined();
    });

    it("refuses a total that differs, undoing everything", async () => {
      await addToCart(userId, productId, 2);

      await expect(
        createOrderFromCart(userId, { ...INPUT, expectedTotal: 1 }),
      ).rejects.toMatchObject({ code: "conflict" });

      expect(await stock()).toBe(10);
      await expect(OrderModel.countDocuments()).resolves.toBe(0);
      expect((await getCart(userId)).itemCount).toBe(2);
    });

    it("accepts the total that was shown", async () => {
      await addToCart(userId, productId, 2);

      // 100 reaches free shipping, plus 13% tax.
      await expect(
        createOrderFromCart(userId, { ...INPUT, expectedTotal: 113 }),
      ).resolves.toMatchObject({ totalPrice: 113 });
    });
  });

  describe("listOrdersForUser", () => {
    it("respects a limit, newest first", async () => {
      const first = await placeOrder(1);
      const second = await placeOrder(1);

      const orders = await listOrdersForUser(userId, { limit: 1 });

      expect(orders.map((order) => String(order._id))).toEqual([second]);
      expect(orders.map((order) => String(order._id))).not.toContain(first);
      expect(orders[0].itemCount).toBe(1);
    });
  });

  describe("lowering a cart line stock has fallen below", () => {
    const setStock = (countInStock: number, isActive = true) =>
      ProductModel.updateOne({ _id: productId }, { countInStock, isActive });

    it("allows a step that is still above the stock", async () => {
      await addToCart(userId, productId, 5);
      await setStock(2);

      await expect(setCartItemQty(userId, productId, 4)).resolves.toMatchObject({
        hasIssues: true,
      });
    });

    it("clears the issue once within stock", async () => {
      await addToCart(userId, productId, 5);
      await setStock(2);

      await expect(setCartItemQty(userId, productId, 2)).resolves.toMatchObject({
        hasIssues: false,
      });
    });

    it("still refuses a rise above the stock", async () => {
      await addToCart(userId, productId, 1);
      await setStock(2);

      await expect(setCartItemQty(userId, productId, 3)).rejects.toMatchObject({
        code: "out_of_stock",
      });
    });

    it("works on a withdrawn product", async () => {
      await addToCart(userId, productId, 3);
      await setStock(10, false);

      await expect(setCartItemQty(userId, productId, 2)).resolves.toBeDefined();
    });

    it("refuses a rise on a withdrawn product", async () => {
      await addToCart(userId, productId, 1);
      await setStock(10, false);

      await expect(setCartItemQty(userId, productId, 2)).rejects.toMatchObject({
        code: "not_found",
      });
    });

    it("still needs the line to exist", async () => {
      await CartModel.deleteMany({});

      await expect(setCartItemQty(userId, productId, 1)).rejects.toMatchObject({
        code: "not_found",
      });
    });
  });
});
