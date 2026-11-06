import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CategoryModel,
  OrderModel,
  ProductModel,
  UserModel,
  type Address,
} from "@/server/models";
import {
  MockPaymentProvider,
  type PaymentProvider,
} from "@/server/payments/provider";
import { addToCart } from "./cart";
import {
  createOrderFromCart,
  getLastShippingAddress,
  payOrder,
  toPublicOrder,
} from "./orders";
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

describe("MockPaymentProvider", () => {
  const provider = new MockPaymentProvider();
  const request = { amount: 10, idempotencyKey: "abc" };

  it("approves the approving test method", async () => {
    await expect(
      provider.charge({ ...request, method: "test-approve" }),
    ).resolves.toMatchObject({ ok: true, id: "mock_abc", provider: "mock" });
  });

  it("declines anything it does not recognise", async () => {
    await expect(
      provider.charge({ ...request, method: "free" }),
    ).resolves.toMatchObject({ ok: false });
  });

  it("declines the declining test method", async () => {
    await expect(
      provider.charge({ ...request, method: "test-decline" }),
    ).resolves.toMatchObject({ ok: false, provider: "mock" });
  });
});

describe.skipIf(!dbReachable)("payOrder", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);

  let userId: string;
  let otherUserId: string;
  let orderId: string;

  beforeEach(async () => {
    await clearDatabase();

    const [user, other] = await UserModel.create([
      { name: "Ada", email: "ada@example.com", password: "correct-horse" },
      { name: "Eve", email: "eve@example.com", password: "correct-horse" },
    ]);
    userId = String(user._id);
    otherUserId = String(other._id);

    const category = await CategoryModel.create({ name: "Audio", slug: "audio" });
    const product = await ProductModel.create({
      name: "Speaker",
      image: "/images/products/x.svg",
      description: "A speaker.",
      brand: "Soniq",
      price: 50,
      countInStock: 5,
      category: category._id,
    });

    await addToCart(userId, String(product._id), 1);
    const order = await createOrderFromCart(userId, {
      shippingAddress: ADDRESS,
      paymentMethod: "test-approve",
    });
    orderId = String(order._id);
  });

  it("marks the order paid and records the provider's result", async () => {
    const paid = await payOrder(orderId, userId, {
      paymentMethod: "test-approve",
    });

    expect(paid).toMatchObject({ isPaid: true, status: "paid" });
    expect(paid.paidAt).toBeInstanceOf(Date);
    expect(paid.paymentResult).toMatchObject({
      id: `mock_${orderId}:1`,
      provider: "mock",
    });
  });

  it("charges the server's total", async () => {
    const provider: PaymentProvider = {
      name: "spy",
      charge: vi.fn(async () => ({
        ok: true as const,
        id: "x",
        status: "succeeded" as const,
        provider: "spy",
      })),
    };

    await payOrder(orderId, userId, { paymentMethod: "test-approve", provider });

    // 50 + 13% tax + 9.99 shipping, since 50 is under the free threshold.
    expect(provider.charge).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 66.49, idempotencyKey: `${orderId}:1` }),
    );
  });

  it("leaves a declined order pending so it can be retried", async () => {
    await expect(
      payOrder(orderId, userId, { paymentMethod: "test-decline" }),
    ).rejects.toMatchObject({ code: "payment_declined" });

    const order = await OrderModel.findById(orderId).lean();
    expect(order).toMatchObject({ isPaid: false, status: "pending" });
    expect(order?.paymentResult?.status).toBe("declined");

    await expect(
      payOrder(orderId, userId, { paymentMethod: "test-approve" }),
    ).resolves.toMatchObject({ isPaid: true });
  });

  const spyProvider = (): PaymentProvider => ({
    name: "spy",
    charge: vi.fn(async ({ idempotencyKey }) => ({
      ok: true as const,
      id: idempotencyKey,
      status: "succeeded" as const,
      provider: "spy",
    })),
  });

  it("refuses to pay twice, without touching the provider", async () => {
    await payOrder(orderId, userId, { paymentMethod: "test-approve" });

    const provider = spyProvider();
    await expect(
      payOrder(orderId, userId, { paymentMethod: "test-approve", provider }),
    ).rejects.toMatchObject({ code: "conflict" });

    expect(provider.charge).not.toHaveBeenCalled();
  });

  it("charges once when two payments race", async () => {
    const provider = spyProvider();

    const results = await Promise.allSettled([
      payOrder(orderId, userId, { paymentMethod: "test-approve", provider }),
      payOrder(orderId, userId, { paymentMethod: "test-approve", provider }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(provider.charge).toHaveBeenCalledTimes(1);
  });

  it("uses a new idempotency key for each attempt", async () => {
    await expect(
      payOrder(orderId, userId, { paymentMethod: "test-decline" }),
    ).rejects.toMatchObject({ code: "payment_declined" });

    const provider = spyProvider();
    await payOrder(orderId, userId, { paymentMethod: "test-approve", provider });

    expect(provider.charge).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `${orderId}:2` }),
    );
  });

  it("releases the claim when the provider throws, so the order can be retried", async () => {
    const provider: PaymentProvider = {
      name: "broken",
      charge: vi.fn(async () => {
        throw new Error("network down");
      }),
    };

    await expect(
      payOrder(orderId, userId, { paymentMethod: "test-approve", provider }),
    ).rejects.toThrow("network down");

    await expect(
      payOrder(orderId, userId, { paymentMethod: "test-approve" }),
    ).resolves.toMatchObject({ isPaid: true });
  });

  it("takes over a claim left behind by a process that died", async () => {
    await OrderModel.updateOne(
      { _id: orderId },
      {
        "paymentResult.status": "processing",
        "paymentResult.updateTime": new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    );

    await expect(
      payOrder(orderId, userId, { paymentMethod: "test-approve" }),
    ).resolves.toMatchObject({ isPaid: true });
  });

  it("will not take over a live claim", async () => {
    await OrderModel.updateOne(
      { _id: orderId },
      {
        "paymentResult.status": "processing",
        "paymentResult.updateTime": new Date().toISOString(),
      },
    );

    const provider = spyProvider();
    await expect(
      payOrder(orderId, userId, { paymentMethod: "test-approve", provider }),
    ).rejects.toMatchObject({ code: "conflict" });

    expect(provider.charge).not.toHaveBeenCalled();
  });

  it("refuses someone else's order", async () => {
    await expect(
      payOrder(orderId, otherUserId, { paymentMethod: "test-approve" }),
    ).rejects.toMatchObject({ code: "forbidden" });

    const order = await OrderModel.findById(orderId).lean();
    expect(order?.isPaid).toBe(false);
  });

  it("refuses a cancelled order", async () => {
    await OrderModel.updateOne({ _id: orderId }, { status: "cancelled" });

    await expect(
      payOrder(orderId, userId, { paymentMethod: "test-approve" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  describe("getLastShippingAddress", () => {
    it("returns the address from the latest order", async () => {
      const product = await ProductModel.findOne();
      await addToCart(userId, String(product?._id), 1);
      await createOrderFromCart(userId, {
        shippingAddress: { ...ADDRESS, city: "Paris" },
        paymentMethod: "test-approve",
      });

      await expect(getLastShippingAddress(userId)).resolves.toMatchObject({
        city: "Paris",
      });
    });

    it("returns null for someone with no orders", async () => {
      await expect(getLastShippingAddress(otherUserId)).resolves.toBeNull();
    });
  });

  describe("toPublicOrder", () => {
    it("produces plain JSON values and keeps the ids private to the URL", async () => {
      const order = await OrderModel.findById(orderId).lean();
      const view = toPublicOrder(order!);

      expect(JSON.parse(JSON.stringify(view))).toEqual(view);
      expect(view.number).toBe(orderId.slice(-8).toUpperCase());
      expect(view.items[0]).toMatchObject({ qty: 1, lineTotal: 50 });
    });
  });
});
