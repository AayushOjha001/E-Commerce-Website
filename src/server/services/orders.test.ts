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
import { addToCart, getCart } from "./cart";
import {
  createOrderFromCart,
  getOrderForUser,
  listOrdersForUser,
} from "./orders";
import { calculateOrderTotals } from "./pricing";
import {
  clearDatabase,
  dbReachable,
  requireDb,
  setupTestDatabase,
  teardownTestDatabase,
} from "@/test/db";

const SHIPPING: Address = {
  fullName: "Ada Lovelace",
  address: "1 Analytical Way",
  city: "London",
  postalCode: "E1 6AN",
  country: "UK",
};

describe("database availability", () => {
  it.runIf(requireDb)("is reachable, because REQUIRE_DB=1", () => {
    expect(dbReachable).toBe(true);
  });
});

describe.skipIf(!dbReachable)("orders service", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);

  let userId: string;
  let otherUserId: string;
  let widgetId: string;
  let gadgetId: string;

  beforeEach(async () => {
    await clearDatabase();

    const [user, other] = await UserModel.create([
      { name: "Ada", email: "ada@example.com", password: "secret123" },
      { name: "Grace", email: "grace@example.com", password: "secret123" },
    ]);
    userId = String(user._id);
    otherUserId = String(other._id);

    const category = await CategoryModel.create({ name: "Tools", slug: "tools" });

    const [widget, gadget] = await ProductModel.create([
      {
        name: "Widget",
        slug: "widget",
        image: "/w.svg",
        description: "d",
        brand: "ACME",
        category: category._id,
        price: 19.99,
        countInStock: 5,
      },
      {
        name: "Gadget",
        slug: "gadget",
        image: "/g.svg",
        description: "d",
        brand: "ACME",
        category: category._id,
        price: 2.5,
        countInStock: 100,
      },
    ]);
    widgetId = String(widget._id);
    gadgetId = String(gadget._id);
  });

  describe("createOrderFromCart", () => {
    it("creates an order from the cart (audit B2: this used to always 500)", async () => {
      await addToCart(userId, widgetId, 2);

      const order = await createOrderFromCart(userId, {
        shippingAddress: SHIPPING,
        paymentMethod: "mock",
      });

      expect(order.orderItems).toHaveLength(1);
      expect(order.status).toBe("pending");
      expect(order.isPaid).toBe(false);
      expect(String(order.user)).toBe(userId);
    });

    it("snapshots name, image and price from the database, not the client", async () => {
      await addToCart(userId, widgetId, 1);

      const order = await createOrderFromCart(userId, {
        shippingAddress: SHIPPING,
        paymentMethod: "mock",
      });

      // image was required by the schema but never set by the legacy
      // controller, so a server-built order could not validate (audit B11).
      expect(order.orderItems[0]).toMatchObject({
        name: "Widget",
        image: "/w.svg",
        price: 19.99,
      });
    });

    it("computes all four money fields server-side (audit B3)", async () => {
      await addToCart(userId, widgetId, 2); // 39.98
      await addToCart(userId, gadgetId, 4); // 10.00

      const order = await createOrderFromCart(userId, {
        shippingAddress: SHIPPING,
        paymentMethod: "mock",
      });

      const expected = calculateOrderTotals([
        { price: 19.99, qty: 2 },
        { price: 2.5, qty: 4 },
      ]);

      expect(order.itemsPrice).toBe(expected.itemsPrice);
      // The legacy version left tax and shipping at their 0 defaults.
      expect(order.taxPrice).toBe(expected.taxPrice);
      expect(order.shippingPrice).toBe(expected.shippingPrice);
      expect(order.totalPrice).toBe(expected.totalPrice);
      expect(order.totalPrice).toBeGreaterThan(order.itemsPrice);
    });

    it("decrements stock (audit B13)", async () => {
      await addToCart(userId, widgetId, 2);

      await createOrderFromCart(userId, {
        shippingAddress: SHIPPING,
        paymentMethod: "mock",
      });

      const widget = await ProductModel.findById(widgetId);
      expect(widget!.countInStock).toBe(3);
    });

    it("empties the cart", async () => {
      await addToCart(userId, widgetId, 1);

      await createOrderFromCart(userId, {
        shippingAddress: SHIPPING,
        paymentMethod: "mock",
      });

      await expect(getCart(userId).then((c) => c.itemCount)).resolves.toBe(0);
    });

    it("rejects an empty cart", async () => {
      await expect(
        createOrderFromCart(userId, {
          shippingAddress: SHIPPING,
          paymentMethod: "mock",
        }),
      ).rejects.toMatchObject({ code: "conflict" });
    });

    it("requires a payment method", async () => {
      await addToCart(userId, widgetId, 1);

      await expect(
        createOrderFromCart(userId, {
          shippingAddress: SHIPPING,
          paymentMethod: "   ",
        }),
      ).rejects.toMatchObject({ code: "validation" });
    });

    it("rejects when stock dropped below the cart qty, and changes nothing", async () => {
      await addToCart(userId, widgetId, 4);
      await ProductModel.findByIdAndUpdate(widgetId, { countInStock: 1 });

      await expect(
        createOrderFromCart(userId, {
          shippingAddress: SHIPPING,
          paymentMethod: "mock",
        }),
      ).rejects.toMatchObject({ code: "out_of_stock" });

      // Transaction rolled back: no order, stock untouched, cart intact.
      await expect(OrderModel.countDocuments()).resolves.toBe(0);
      const widget = await ProductModel.findById(widgetId);
      expect(widget!.countInStock).toBe(1);
      await expect(getCart(userId).then((c) => c.itemCount)).resolves.toBe(4);
    });

    it("rolls back the first item's stock when a later item fails", async () => {
      // This is what the transaction is for: gadget succeeds, widget fails, and
      // gadget's decrement must not survive.
      await addToCart(userId, gadgetId, 2);
      await addToCart(userId, widgetId, 3);
      await ProductModel.findByIdAndUpdate(widgetId, { countInStock: 0 });

      await expect(
        createOrderFromCart(userId, {
          shippingAddress: SHIPPING,
          paymentMethod: "mock",
        }),
      ).rejects.toMatchObject({ code: "out_of_stock" });

      const gadget = await ProductModel.findById(gadgetId);
      expect(gadget!.countInStock).toBe(100);
      await expect(OrderModel.countDocuments()).resolves.toBe(0);
    });

    it("rejects when a product went inactive after being added", async () => {
      await addToCart(userId, widgetId, 1);
      await ProductModel.findByIdAndUpdate(widgetId, { isActive: false });

      await expect(
        createOrderFromCart(userId, {
          shippingAddress: SHIPPING,
          paymentMethod: "mock",
        }),
      ).rejects.toMatchObject({ code: "conflict" });
      await expect(OrderModel.countDocuments()).resolves.toBe(0);
    });

    it("requires a complete shipping address", async () => {
      await addToCart(userId, widgetId, 1);

      await expect(
        createOrderFromCart(userId, {
          shippingAddress: { fullName: "Ada" } as Address,
          paymentMethod: "mock",
        }),
      ).rejects.toThrow(/required/i);
      await expect(OrderModel.countDocuments()).resolves.toBe(0);
    });

    it("lets only one of two concurrent checkouts win the last unit", async () => {
      // The reason stock is decremented with a conditional update rather than
      // read-then-write: both would otherwise pass the check and oversell.
      await ProductModel.findByIdAndUpdate(widgetId, { countInStock: 1 });
      await addToCart(userId, widgetId, 1);
      await addToCart(otherUserId, widgetId, 1);

      const results = await Promise.allSettled([
        createOrderFromCart(userId, {
          shippingAddress: SHIPPING,
          paymentMethod: "mock",
        }),
        createOrderFromCart(otherUserId, {
          shippingAddress: SHIPPING,
          paymentMethod: "mock",
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled).toHaveLength(1);

      const widget = await ProductModel.findById(widgetId);
      expect(widget!.countInStock).toBe(0);
      await expect(OrderModel.countDocuments()).resolves.toBe(1);
    });

    it("creates only one order when the SAME user double-submits", async () => {
      // The likelier real-world race: one customer double-clicking "Place
      // order". Correctness rests on the cart being emptied inside the
      // transaction; a refactor that moved that outside would silently allow
      // two orders with nothing else failing.
      await ProductModel.findByIdAndUpdate(widgetId, { countInStock: 10 });
      await addToCart(userId, widgetId, 2);

      const results = await Promise.allSettled([
        createOrderFromCart(userId, {
          shippingAddress: SHIPPING,
          paymentMethod: "mock",
        }),
        createOrderFromCart(userId, {
          shippingAddress: SHIPPING,
          paymentMethod: "mock",
        }),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      await expect(OrderModel.countDocuments()).resolves.toBe(1);

      // Stock must be decremented exactly once, not twice.
      const widget = await ProductModel.findById(widgetId);
      expect(widget!.countInStock).toBe(8);
      await expect(getCart(userId).then((c) => c.itemCount)).resolves.toBe(0);
    });

    it("throws not_found for a malformed user id", async () => {
      await expect(
        createOrderFromCart("garbage", {
          shippingAddress: SHIPPING,
          paymentMethod: "mock",
        }),
      ).rejects.toMatchObject({ code: "not_found" });
    });
  });

  describe("listOrdersForUser", () => {
    it("returns only that user's orders, newest first", async () => {
      await addToCart(userId, widgetId, 1);
      await createOrderFromCart(userId, {
        shippingAddress: SHIPPING,
        paymentMethod: "mock",
      });
      await addToCart(userId, gadgetId, 2);
      await createOrderFromCart(userId, {
        shippingAddress: SHIPPING,
        paymentMethod: "mock",
      });
      await addToCart(otherUserId, gadgetId, 1);
      await createOrderFromCart(otherUserId, {
        shippingAddress: SHIPPING,
        paymentMethod: "mock",
      });

      const orders = await listOrdersForUser(userId);

      expect(orders).toHaveLength(2);
      expect(orders[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(
        orders[1]!.createdAt.getTime(),
      );
    });

    it("includes an item count", async () => {
      await addToCart(userId, widgetId, 2);
      await addToCart(userId, gadgetId, 3);
      await createOrderFromCart(userId, {
        shippingAddress: SHIPPING,
        paymentMethod: "mock",
      });

      const [order] = await listOrdersForUser(userId);
      expect(order!.itemCount).toBe(5);
    });

    it("returns an empty list for a user with none, or a malformed id", async () => {
      await expect(listOrdersForUser(userId)).resolves.toEqual([]);
      await expect(listOrdersForUser("garbage")).resolves.toEqual([]);
    });
  });

  describe("getOrderForUser", () => {
    async function makeOrder(owner: string) {
      await addToCart(owner, gadgetId, 1);
      return createOrderFromCart(owner, {
        shippingAddress: SHIPPING,
        paymentMethod: "mock",
      });
    }

    it("returns the owner's own order", async () => {
      const order = await makeOrder(userId);

      const fetched = await getOrderForUser(String(order._id), userId);

      expect(String(fetched._id)).toBe(String(order._id));
    });

    it("DENIES another user's order (audit B4 IDOR)", async () => {
      const order = await makeOrder(userId);

      // The legacy endpoint returned this happily, shipping address included.
      await expect(
        getOrderForUser(String(order._id), otherUserId),
      ).rejects.toMatchObject({ code: "forbidden" });
    });

    it("allows an admin to read any order", async () => {
      const order = await makeOrder(userId);

      const fetched = await getOrderForUser(String(order._id), otherUserId, {
        isAdmin: true,
      });

      expect(String(fetched._id)).toBe(String(order._id));
    });

    it("throws not_found for an unknown id, so ids cannot be probed", async () => {
      await expect(
        getOrderForUser(String(new Types.ObjectId()), userId),
      ).rejects.toMatchObject({ code: "not_found" });
    });

    it("throws not_found for a malformed id", async () => {
      await expect(getOrderForUser("garbage", userId)).rejects.toMatchObject({
        code: "not_found",
      });
    });
  });

  describe("cart/order isolation", () => {
    it("does not touch another user's cart when ordering", async () => {
      await addToCart(userId, widgetId, 1);
      await addToCart(otherUserId, gadgetId, 2);

      await createOrderFromCart(userId, {
        shippingAddress: SHIPPING,
        paymentMethod: "mock",
      });

      await expect(
        getCart(otherUserId).then((c) => c.itemCount),
      ).resolves.toBe(2);
      await expect(
        CartModel.countDocuments({ user: otherUserId }),
      ).resolves.toBe(1);
    });
  });
});
