import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbReachable, setupTestDatabase, teardownTestDatabase } from "@/test/db";
import { CategoryModel, ProductModel } from "@/server/models";
import { GET as listRoute } from "./route";
import { GET as detailRoute } from "./[id]/route";
import { GET as categoriesRoute } from "../categories/route";

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe.skipIf(!dbReachable)("catalog route handlers", () => {
  let activeId: string;
  let inactiveId: string;

  beforeAll(async () => {
    await setupTestDatabase();

    const [audio, kitchen] = await CategoryModel.create([
      { name: "Audio", slug: "audio" },
      { name: "Kitchen", slug: "kitchen" },
    ]);

    const shared = {
      image: "/images/products/x.svg",
      description: "A description.",
      brand: "Soniq",
      countInStock: 5,
    };

    const products = await ProductModel.create([
      { ...shared, name: "Quiet Speaker", price: 50, category: audio._id },
      { ...shared, name: "Loud Speaker", price: 150, category: audio._id },
      { ...shared, name: "Slow Kettle", price: 80, category: kitchen._id },
      {
        ...shared,
        name: "Retired Speaker",
        price: 10,
        category: audio._id,
        isActive: false,
      },
    ]);

    activeId = String(products[0]._id);
    inactiveId = String(products[3]._id);
  });

  afterAll(teardownTestDatabase);

  describe("GET /api/products", () => {
    it("returns public products with paging fields", async () => {
      const response = await listRoute(
        new Request("http://localhost/api/products"),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.total).toBe(3);
      expect(body.items[0]).toMatchObject({
        id: expect.any(String),
        category: { name: expect.any(String), slug: expect.any(String) },
      });
      expect(body.items[0]).not.toHaveProperty("__v");
      expect(body.items[0]).not.toHaveProperty("isActive");
    });

    it("filters, sorts and pages through the query string", async () => {
      const response = await listRoute(
        new Request(
          "http://localhost/api/products?category=audio&sort=price-desc&limit=1",
        ),
      );
      const body = await response.json();

      expect(body.total).toBe(2);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].name).toBe("Loud Speaker");
      expect(body.hasNext).toBe(true);
    });

    it("searches without exposing the text score", async () => {
      const response = await listRoute(
        new Request("http://localhost/api/products?search=kettle"),
      );
      const body = await response.json();

      expect(body.items.map((item: { name: string }) => item.name)).toEqual([
        "Slow Kettle",
      ]);
      expect(body.items[0]).not.toHaveProperty("score");
    });

    it("answers a bad parameter with a JSON 400", async () => {
      const response = await listRoute(
        new Request("http://localhost/api/products?sort=cheapest"),
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.details).toHaveProperty("sort");
    });

    it("answers an inverted price range with a JSON 400", async () => {
      const response = await listRoute(
        new Request("http://localhost/api/products?minPrice=100&maxPrice=5"),
      );

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/products/[id]", () => {
    it("returns the product", async () => {
      const response = await detailRoute(
        new Request("http://localhost"),
        context(activeId),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.product.name).toBe("Quiet Speaker");
    });

    it("gives a JSON 404 for an unknown id", async () => {
      const response = await detailRoute(
        new Request("http://localhost"),
        context("64b000000000000000000000"),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ message: "Product not found" });
    });

    it("gives a JSON 404 for a malformed id, not a 500", async () => {
      const response = await detailRoute(
        new Request("http://localhost"),
        context("not-an-id"),
      );

      expect(response.status).toBe(404);
    });

    it("hides a soft-deleted product", async () => {
      const response = await detailRoute(
        new Request("http://localhost"),
        context(inactiveId),
      );

      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/categories", () => {
    it("counts active products only", async () => {
      const response = await categoriesRoute();
      const { categories } = await response.json();

      expect(categories).toEqual([
        expect.objectContaining({ slug: "audio", productCount: 2 }),
        expect.objectContaining({ slug: "kitchen", productCount: 1 }),
      ]);
    });
  });
});
