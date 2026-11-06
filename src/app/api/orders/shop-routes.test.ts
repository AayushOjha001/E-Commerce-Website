import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { dbReachable, clearDatabase, setupTestDatabase, teardownTestDatabase } from "@/test/db";

const jar = await vi.hoisted(async () => {
  const { createCookieJar } = await import("@/test/cookie-jar");
  return createCookieJar();
});

vi.mock("next/headers", () => ({
  cookies: async () => jar.cookieStore,
}));

const { GET: getCartRoute, POST: postCart } = await import("@/app/api/cart/route");
const { PATCH: patchCart, DELETE: deleteCart } = await import(
  "@/app/api/cart/[productId]/route"
);
const { GET: listOrders, POST: postOrder } = await import("./route");
const { GET: getOrder } = await import("./[id]/route");
const { POST: payRoute } = await import("./[id]/pay/route");
const { setSessionCookie, SESSION_COOKIE } = await import("@/server/auth/session");
const { CategoryModel, ProductModel, UserModel } = await import("@/server/models");

function json(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) });

const ADDRESS = {
  fullName: "Ada Lovelace",
  address: "1 Analytical Way",
  city: "London",
  postalCode: "SW1A 1AA",
  country: "United Kingdom",
};

const CHECKOUT = { shippingAddress: ADDRESS, paymentMethod: "test-approve" };

describe.skipIf(!dbReachable)("cart and order route handlers", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);

  let adaId: string;
  let eveId: string;
  let adminId: string;
  let productId: string;

  const signInAs = (userId: string, role: "customer" | "admin" = "customer") =>
    setSessionCookie({ userId, role, tokenVersion: 0 });

  beforeEach(async () => {
    await clearDatabase();
    jar.cookieStore.delete(SESSION_COOKIE);

    const [ada, eve, admin] = await UserModel.create([
      { name: "Ada", email: "ada@example.com", password: "correct-horse" },
      { name: "Eve", email: "eve@example.com", password: "correct-horse" },
      { name: "Root", email: "root@example.com", password: "correct-horse", role: "admin" },
    ]);
    adaId = String(ada._id);
    eveId = String(eve._id);
    adminId = String(admin._id);

    const category = await CategoryModel.create({ name: "Audio", slug: "audio" });
    const product = await ProductModel.create({
      name: "Speaker",
      image: "/images/products/x.svg",
      description: "A speaker.",
      brand: "Soniq",
      price: 150,
      countInStock: 3,
      category: category._id,
    });
    productId = String(product._id);
  });

  describe("signed out", () => {
    it("answers every private route with a JSON 401", async () => {
      const responses = await Promise.all([
        getCartRoute(),
        postCart(json({ productId })),
        listOrders(),
        postOrder(json(CHECKOUT)),
        getOrder(new Request("http://localhost"), params({ id: productId })),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(401);
      }
    });
  });

  describe("cart", () => {
    beforeEach(() => signInAs(adaId));

    it("adds, increments, sets and removes", async () => {
      await postCart(json({ productId, qty: 1 }));
      const added = await (await postCart(json({ productId }))).json();
      expect(added.cart.items[0].qty).toBe(2);

      const set = await patchCart(
        json({ qty: 3 }, "PATCH"),
        params({ productId }),
      );
      expect((await set.json()).cart.items[0].qty).toBe(3);

      const removed = await deleteCart(
        new Request("http://localhost"),
        params({ productId }),
      );
      expect((await removed.json()).cart.items).toEqual([]);
    });

    it("rejects more than the stock with a 409", async () => {
      const response = await postCart(json({ productId, qty: 4 }));

      expect(response.status).toBe(409);
      expect((await response.json()).message).toContain("Only 3");
    });

    it.each([[0], [-1], [1.5], ["two"]])("rejects a qty of %s with a 400", async (qty) => {
      const response = await postCart(json({ productId, qty }));

      expect(response.status).toBe(400);
    });

    it("rejects a body with no product", async () => {
      expect((await postCart(json({}))).status).toBe(400);
    });

    it("gives a JSON 404 for an unknown product", async () => {
      const response = await postCart(json({ productId: "not-an-id" }));

      expect(response.status).toBe(404);
    });
  });

  describe("orders", () => {
    beforeEach(async () => {
      await signInAs(adaId);
      await postCart(json({ productId, qty: 2 }));
    });

    it("ignores any money the client sends", async () => {
      const response = await postOrder(
        json({
          ...CHECKOUT,
          totalPrice: 0.01,
          itemsPrice: 0.01,
          orderItems: [{ name: "Speaker", qty: 2, price: 0.01, product: productId }],
        }),
      );
      const { order } = await response.json();

      expect(response.status).toBe(201);
      expect(order.itemsPrice).toBe(300);
      expect(order.taxPrice).toBe(39);
      expect(order.shippingPrice).toBe(0);
      expect(order.totalPrice).toBe(339);
    });

    it("decrements stock and empties the cart", async () => {
      await postOrder(json(CHECKOUT));

      const product = await ProductModel.findById(productId).lean();
      expect(product?.countInStock).toBe(1);

      const { cart } = await (
        await getCartRoute()
      ).json();
      expect(cart.items).toEqual([]);
    });

    it("rejects checkout of an empty cart", async () => {
      await postOrder(json(CHECKOUT));
      const response = await postOrder(json(CHECKOUT));

      expect(response.status).toBe(409);
      expect((await response.json()).message).toBe("Your cart is empty");
    });

    it("rejects checkout when stock ran out after adding to the cart", async () => {
      await ProductModel.updateOne({ _id: productId }, { countInStock: 1 });

      const response = await postOrder(json(CHECKOUT));

      expect(response.status).toBe(409);
      const product = await ProductModel.findById(productId).lean();
      expect(product?.countInStock).toBe(1);
    });

    it("reports which address fields are missing", async () => {
      const response = await postOrder(
        json({ ...CHECKOUT, shippingAddress: { ...ADDRESS, city: "" } }),
      );

      expect(response.status).toBe(400);
      expect((await response.json()).details).toHaveProperty(
        ["shippingAddress.city"],
        "City is required",
      );
    });

    it("rejects an unknown payment method", async () => {
      const response = await postOrder(json({ ...CHECKOUT, paymentMethod: "cash" }));

      expect(response.status).toBe(400);
    });

    describe("with a placed order", () => {
      let orderId: string;

      beforeEach(async () => {
        const { order } = await (await postOrder(json(CHECKOUT))).json();
        orderId = order.id;
      });

      it("lists the caller's own orders", async () => {
        const { orders } = await (
          await listOrders()
        ).json();

        expect(orders).toHaveLength(1);
        expect(orders[0]).toMatchObject({ id: orderId, itemCount: 2 });
      });

      it("does not list them for anyone else", async () => {
        await signInAs(eveId);
        const { orders } = await (
          await listOrders()
        ).json();

        expect(orders).toEqual([]);
      });

      it("denies another customer the order (audit B4)", async () => {
        await signInAs(eveId);
        const response = await getOrder(
          new Request("http://localhost"),
          params({ id: orderId }),
        );

        expect(response.status).toBe(403);
        expect(await response.json()).not.toHaveProperty("order");
      });

      it("denies another customer paying for the order", async () => {
        await signInAs(eveId);
        const response = await payRoute(
          json({ paymentMethod: "test-approve" }),
          params({ id: orderId }),
        );

        expect(response.status).toBe(403);
      });

      it("lets an admin read any order", async () => {
        await signInAs(adminId, "admin");
        const response = await getOrder(
          new Request("http://localhost"),
          params({ id: orderId }),
        );

        expect(response.status).toBe(200);
      });

      it("pays, then refuses a second payment", async () => {
        const first = await payRoute(
          json({ paymentMethod: "test-approve" }),
          params({ id: orderId }),
        );
        const second = await payRoute(
          json({ paymentMethod: "test-approve" }),
          params({ id: orderId }),
        );

        expect(first.status).toBe(200);
        expect((await first.json()).order.status).toBe("paid");
        expect(second.status).toBe(409);
      });

      it("answers a declined payment with a 402", async () => {
        const response = await payRoute(
          json({ paymentMethod: "test-decline" }),
          params({ id: orderId }),
        );

        expect(response.status).toBe(402);
      });
    });
  });
});
