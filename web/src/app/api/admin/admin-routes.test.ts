import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { clearDatabase, dbReachable, setupTestDatabase, teardownTestDatabase } from "@/test/db";

const jar = await vi.hoisted(async () => {
  const { createCookieJar } = await import("@/test/cookie-jar");
  return createCookieJar();
});

vi.mock("next/headers", () => ({ cookies: async () => jar.cookieStore }));

const products = await import("./products/route");
const product = await import("./products/[id]/route");
const categories = await import("./categories/route");
const category = await import("./categories/[id]/route");
const orders = await import("./orders/route");
const order = await import("./orders/[id]/route");
const { setSessionCookie, SESSION_COOKIE } = await import("@/server/auth/session");
const { CategoryModel, ProductModel, UserModel } = await import("@/server/models");

const ID = "64b000000000000000000000";
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const url = "http://localhost/api/admin";

function json(body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ROUTES: [string, () => Promise<Response>][] = [
  ["GET products", () => products.GET(new Request(url))],
  ["POST products", () => products.POST(json({}))],
  ["PATCH product", () => product.PATCH(json({}, "PATCH"), params(ID))],
  ["DELETE product", () => product.DELETE(new Request(url), params(ID))],
  ["GET categories", () => categories.GET()],
  ["POST categories", () => categories.POST(json({}))],
  ["PATCH category", () => category.PATCH(json({}, "PATCH"), params(ID))],
  ["DELETE category", () => category.DELETE(new Request(url), params(ID))],
  ["GET orders", () => orders.GET(new Request(url))],
  ["PATCH order", () => order.PATCH(json({}, "PATCH"), params(ID))],
];

describe.skipIf(!dbReachable)("admin route handlers", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);

  let customerId: string;
  let adminId: string;
  let categoryId: string;

  beforeEach(async () => {
    await clearDatabase();
    jar.cookieStore.delete(SESSION_COOKIE);

    const [customer, admin] = await UserModel.create([
      { name: "Ada", email: "ada@example.com", password: "correct-horse" },
      { name: "Root", email: "root@example.com", password: "correct-horse", role: "admin" },
    ]);
    customerId = String(customer._id);
    adminId = String(admin._id);

    const created = await CategoryModel.create({ name: "Audio", slug: "audio" });
    categoryId = String(created._id);
  });

  it.each(ROUTES)("%s answers 401 when signed out", async (_name, call) => {
    expect((await call()).status).toBe(401);
  });

  it.each(ROUTES)("%s looks absent to a customer", async (_name, call) => {
    await setSessionCookie({ userId: customerId, role: "customer", tokenVersion: 0 });

    expect((await call()).status).toBe(404);
  });

  it("does not trust a role claim the database disagrees with", async () => {
    await setSessionCookie({ userId: customerId, role: "admin", tokenVersion: 0 });

    expect((await products.GET(new Request(url))).status).toBe(404);
  });

  describe("as an admin", () => {
    beforeEach(() =>
      setSessionCookie({ userId: adminId, role: "admin", tokenVersion: 0 }),
    );

    const VALID = () => ({
      name: "Quiet Fan",
      brand: "Hearth",
      description: "A fan.",
      image: "/images/products/fan.svg",
      category: categoryId,
      price: 40,
      countInStock: 2,
    });

    it("creates, updates, withdraws and lists a product", async () => {
      const created = await products.POST(json(VALID()));
      const { product: body } = await created.json();
      expect(created.status).toBe(201);

      const updated = await product.PATCH(
        json({ price: 55 }, "PATCH"),
        params(body.id),
      );
      expect((await updated.json()).product.price).toBe(55);

      await product.DELETE(new Request(url), params(body.id));

      const list = await (await products.GET(new Request(url))).json();
      expect(list.total).toBe(1);

      const stored = await ProductModel.findById(body.id).lean();
      expect(stored?.isActive).toBe(false);
    });

    it("returns a product to sale through PATCH", async () => {
      const { product: body } = await (await products.POST(json(VALID()))).json();
      await product.DELETE(new Request(url), params(body.id));

      await product.PATCH(json({ isActive: true }, "PATCH"), params(body.id));

      expect((await ProductModel.findById(body.id).lean())?.isActive).toBe(true);
    });

    it("rejects an invalid product with field details", async () => {
      const response = await products.POST(json({ ...VALID(), price: -1 }));

      expect(response.status).toBe(400);
      expect((await response.json()).details).toHaveProperty("price");
    });

    it("cannot set rating through the API", async () => {
      const { product: body } = await (
        await products.POST(json({ ...VALID(), rating: 5, numReviews: 9999 }))
      ).json();

      const stored = await ProductModel.findById(body.id).lean();
      expect(stored).toMatchObject({ rating: 0, numReviews: 0 });
    });

    it("creates and deletes a category", async () => {
      const created = await categories.POST(json({ name: "Garden" }));
      const body = await created.json();
      expect(body.category.slug).toBe("garden");

      const deleted = await category.DELETE(new Request(url), params(body.category.id));
      expect(deleted.status).toBe(200);
    });

    it("rejects an unknown order status", async () => {
      const response = await order.PATCH(
        json({ status: "lost" }, "PATCH"),
        params(ID),
      );

      expect(response.status).toBe(400);
    });

    it("rejects a bad order filter", async () => {
      const response = await orders.GET(new Request(`${url}?status=lost`));

      expect(response.status).toBe(400);
    });
  });
});
