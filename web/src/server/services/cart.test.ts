import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CartModel, CategoryModel, ProductModel, UserModel } from "@/server/models";
import {
  MAX_QTY_PER_ITEM,
  addToCart,
  clearCart,
  getCart,
  removeFromCart,
  setCartItemQty,
} from "./cart";
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

describe.skipIf(!dbReachable)("cart service", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);

  let userId: string;
  let widgetId: string;
  let gadgetId: string;
  let retiredId: string;

  beforeEach(async () => {
    await clearDatabase();

    const user = await UserModel.create({
      name: "Ada",
      email: "ada@example.com",
      password: "secret123",
    });
    userId = String(user._id);

    const category = await CategoryModel.create({ name: "Tools", slug: "tools" });

    const [widget, gadget, retired] = await ProductModel.create([
      {
        name: "Widget",
        slug: "widget",
        image: "/w.svg",
        description: "d",
        brand: "ACME",
        category: category._id,
        price: 10,
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
      {
        name: "Retired",
        slug: "retired",
        image: "/r.svg",
        description: "d",
        brand: "ACME",
        category: category._id,
        price: 1,
        countInStock: 10,
        isActive: false,
      },
    ]);
    widgetId = String(widget._id);
    gadgetId = String(gadget._id);
    retiredId = String(retired._id);
  });

  describe("getCart", () => {
    it("returns an empty cart when none exists", async () => {
      await expect(getCart(userId)).resolves.toEqual({
        items: [],
        subtotal: 0,
        itemCount: 0,
        hasIssues: false,
      });
    });

    it("returns an empty cart for a malformed user id", async () => {
      await expect(getCart("nonsense").then((c) => c.items)).resolves.toEqual([]);
    });

    it("computes line totals, subtotal and item count", async () => {
      await addToCart(userId, widgetId, 2);
      await addToCart(userId, gadgetId, 3);

      const cart = await getCart(userId);

      expect(cart.subtotal).toBe(27.5); // 2*10 + 3*2.50
      expect(cart.itemCount).toBe(5);
      expect(cart.items).toHaveLength(2);
      expect(cart.items.find((i) => i.name === "Widget")!.lineTotal).toBe(20);
    });

    it("flags a line whose stock has since dropped below the cart qty", async () => {
      await addToCart(userId, widgetId, 4);
      await ProductModel.findByIdAndUpdate(widgetId, { countInStock: 1 });

      const cart = await getCart(userId);

      expect(cart.items[0]!.exceedsStock).toBe(true);
      expect(cart.hasIssues).toBe(true);
    });

    it("skips a dangling item whose product was deleted outright", async () => {
      await addToCart(userId, widgetId, 1);
      await addToCart(userId, gadgetId, 1);
      await ProductModel.findByIdAndDelete(widgetId);

      const cart = await getCart(userId);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]!.name).toBe("Gadget");
    });

    it("reads price live, so a price change is reflected", async () => {
      await addToCart(userId, widgetId, 1);
      await ProductModel.findByIdAndUpdate(widgetId, { price: 12.5 });

      const cart = await getCart(userId);

      expect(cart.items[0]!.price).toBe(12.5);
      expect(cart.subtotal).toBe(12.5);
    });
  });

  describe("addToCart", () => {
    it("creates the cart on first add", async () => {
      const cart = await addToCart(userId, widgetId, 1);

      expect(cart.itemCount).toBe(1);
      await expect(CartModel.countDocuments({ user: userId })).resolves.toBe(1);
    });

    it("defaults to a quantity of 1", async () => {
      const cart = await addToCart(userId, widgetId);

      expect(cart.items[0]!.qty).toBe(1);
    });

    it("INCREMENTS an existing line rather than overwriting it (audit R9)", async () => {
      await addToCart(userId, widgetId, 1);
      const cart = await addToCart(userId, widgetId, 2);

      // The legacy endpoint did `items[i].qty = qty`, which would give 2 here
      // and silently throw away the first add.
      expect(cart.items[0]!.qty).toBe(3);
      expect(cart.items).toHaveLength(1);
    });

    it("rejects a quantity above available stock", async () => {
      await expect(addToCart(userId, widgetId, 6)).rejects.toMatchObject({
        code: "out_of_stock",
      });
    });

    it("rejects an increment that would exceed stock in total", async () => {
      await addToCart(userId, widgetId, 4);

      await expect(addToCart(userId, widgetId, 2)).rejects.toMatchObject({
        code: "out_of_stock",
      });

      // The failed add must not have changed the cart.
      await expect(getCart(userId).then((c) => c.itemCount)).resolves.toBe(4);
    });

    it("reports how many are left in the message", async () => {
      await expect(addToCart(userId, widgetId, 6)).rejects.toThrow(
        /Only 5 of Widget left/,
      );
    });

    it("says out of stock when there are none", async () => {
      await ProductModel.findByIdAndUpdate(widgetId, { countInStock: 0 });

      await expect(addToCart(userId, widgetId, 1)).rejects.toThrow(
        /Widget is out of stock/,
      );
    });

    it("rejects an inactive product", async () => {
      await expect(addToCart(userId, retiredId, 1)).rejects.toMatchObject({
        code: "not_found",
      });
    });

    it("rejects a missing or malformed product id", async () => {
      await expect(
        addToCart(userId, String(new Types.ObjectId()), 1),
      ).rejects.toMatchObject({ code: "not_found" });
      await expect(addToCart(userId, "garbage", 1)).rejects.toMatchObject({
        code: "not_found",
      });
    });

    it("rejects zero, negative and fractional quantities", async () => {
      for (const qty of [0, -1, 1.5]) {
        await expect(addToCart(userId, widgetId, qty)).rejects.toMatchObject({
          code: "validation",
        });
      }
    });

    it("caps the per-item quantity", async () => {
      await expect(
        addToCart(userId, gadgetId, MAX_QTY_PER_ITEM + 1),
      ).rejects.toMatchObject({ code: "validation" });
    });

    it("caps the per-item quantity across increments", async () => {
      await addToCart(userId, gadgetId, MAX_QTY_PER_ITEM);

      await expect(addToCart(userId, gadgetId, 1)).rejects.toMatchObject({
        code: "validation",
      });
    });

    it("keeps separate lines per product", async () => {
      await addToCart(userId, widgetId, 1);
      const cart = await addToCart(userId, gadgetId, 1);

      expect(cart.items).toHaveLength(2);
    });
  });

  describe("setCartItemQty", () => {
    it("sets an exact quantity", async () => {
      await addToCart(userId, widgetId, 1);

      const cart = await setCartItemQty(userId, widgetId, 4);

      expect(cart.items[0]!.qty).toBe(4);
    });

    it("can lower the quantity", async () => {
      await addToCart(userId, widgetId, 4);

      const cart = await setCartItemQty(userId, widgetId, 1);

      expect(cart.items[0]!.qty).toBe(1);
    });

    it("rejects more than stock, and separately more than the per-item cap", async () => {
      await addToCart(userId, widgetId, 1);

      // Above the cap: a validation failure, regardless of stock.
      await expect(
        setCartItemQty(userId, widgetId, MAX_QTY_PER_ITEM + 1),
      ).rejects.toMatchObject({ code: "validation" });

      // Within the cap but above the 5 in stock.
      await expect(setCartItemQty(userId, widgetId, 6)).rejects.toMatchObject({
        code: "out_of_stock",
      });

      // Neither failure should have changed the cart.
      await expect(getCart(userId).then((c) => c.itemCount)).resolves.toBe(1);
    });

    it("throws not_found when there is no cart or no such line", async () => {
      await expect(
        setCartItemQty(userId, widgetId, 1),
      ).rejects.toMatchObject({ code: "not_found" });

      await addToCart(userId, widgetId, 1);
      await expect(
        setCartItemQty(userId, gadgetId, 1),
      ).rejects.toMatchObject({ code: "not_found" });
    });

    it("rejects an invalid quantity", async () => {
      await addToCart(userId, widgetId, 1);

      await expect(setCartItemQty(userId, widgetId, 0)).rejects.toMatchObject({
        code: "validation",
      });
    });
  });

  describe("removeFromCart", () => {
    it("removes one line and leaves the rest", async () => {
      await addToCart(userId, widgetId, 1);
      await addToCart(userId, gadgetId, 2);

      const cart = await removeFromCart(userId, widgetId);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]!.name).toBe("Gadget");
    });

    it("is idempotent for an item not in the cart", async () => {
      await addToCart(userId, widgetId, 1);

      const cart = await removeFromCart(userId, gadgetId);

      expect(cart.items).toHaveLength(1);
    });

    it("returns an empty cart when the user has none", async () => {
      await expect(
        removeFromCart(userId, widgetId).then((c) => c.items),
      ).resolves.toEqual([]);
    });

    it("rejects a malformed product id", async () => {
      await expect(removeFromCart(userId, "garbage")).rejects.toMatchObject({
        code: "not_found",
      });
    });
  });

  describe("clearCart", () => {
    it("empties the cart but keeps the cart document", async () => {
      await addToCart(userId, widgetId, 2);

      await expect(clearCart(userId).then((c) => c.items)).resolves.toEqual([]);
      await expect(getCart(userId).then((c) => c.itemCount)).resolves.toBe(0);
      await expect(CartModel.countDocuments({ user: userId })).resolves.toBe(1);
    });

    it("is safe when there is no cart", async () => {
      await expect(clearCart(userId)).resolves.toMatchObject({ items: [] });
    });
  });

  describe("isolation between users", () => {
    it("does not leak one user's cart into another's", async () => {
      const other = await UserModel.create({
        name: "Grace",
        email: "grace@example.com",
        password: "secret123",
      });

      await addToCart(userId, widgetId, 2);

      await expect(
        getCart(String(other._id)).then((c) => c.items),
      ).resolves.toEqual([]);
    });
  });
});
