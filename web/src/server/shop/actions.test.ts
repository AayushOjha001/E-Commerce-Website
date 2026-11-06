import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { clearDatabase, dbReachable, setupTestDatabase, teardownTestDatabase } from "@/test/db";

const jar = await vi.hoisted(async () => {
  const { createCookieJar } = await import("@/test/cookie-jar");
  return createCookieJar();
});

vi.mock("next/headers", () => ({ cookies: async () => jar.cookieStore }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`REDIRECT:${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
}));

const { addToCartAction, placeOrderAction, retryPaymentAction, setCartQtyAction } =
  await import("./actions");
const { changePasswordAction } = await import("@/server/auth/account-actions");
const { setSessionCookie, SESSION_COOKIE } = await import("@/server/auth/session");
const { getCart } = await import("@/server/services/cart");
const { CategoryModel, OrderModel, ProductModel, UserModel } = await import(
  "@/server/models"
);

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const ADDRESS = {
  fullName: "Ada Lovelace",
  address: "1 Analytical Way",
  city: "London",
  postalCode: "SW1A 1AA",
  country: "United Kingdom",
};

const redirectTarget = async (action: Promise<unknown>) => {
  const error = await action.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(RedirectSignal);
  return (error as RedirectSignal).to;
};

describe.skipIf(!dbReachable)("shop server actions", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);

  let userId: string;
  let productId: string;

  beforeEach(async () => {
    await clearDatabase();
    jar.cookieStore.delete(SESSION_COOKIE);

    const user = await UserModel.create({
      name: "Ada",
      email: "ada@example.com",
      password: "correct-horse",
    });
    userId = String(user._id);

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

  const signIn = () =>
    setSessionCookie({ userId, role: "customer", tokenVersion: 0 });

  describe("addToCartAction", () => {
    it("sends a guest to sign in and back to the product", async () => {
      const to = await redirectTarget(
        addToCartAction(
          {},
          form({ productId, qty: "1", returnTo: "/products/speaker" }),
        ),
      );

      expect(to).toBe("/login?next=%2Fproducts%2Fspeaker");
    });

    it("refuses to bounce a guest to another site", async () => {
      const to = await redirectTarget(
        addToCartAction(
          {},
          form({ productId, qty: "1", returnTo: "https://evil.example" }),
        ),
      );

      expect(to).not.toContain("evil");
    });

    it("adds for the signed-in user", async () => {
      await signIn();

      await expect(
        addToCartAction({}, form({ productId, qty: "2" })),
      ).resolves.toEqual({ added: true });

      expect((await getCart(userId)).itemCount).toBe(2);
    });

    it("reports a stock problem as a message", async () => {
      await signIn();

      const result = await addToCartAction({}, form({ productId, qty: "9" }));

      expect(result.error).toContain("Only 3");
    });

    it("rejects a nonsense quantity", async () => {
      await signIn();

      const result = await addToCartAction({}, form({ productId, qty: "abc" }));

      expect(result.error).toBe("Choose a valid quantity");
    });
  });

  describe("setCartQtyAction", () => {
    it("reports an impossible quantity, so the optimistic value can snap back", async () => {
      await signIn();
      await addToCartAction({}, form({ productId, qty: "1" }));

      const result = await setCartQtyAction(productId, 9);

      expect(result.error).toContain("Only 3");
      expect((await getCart(userId)).items[0]?.qty).toBe(1);
    });
  });

  describe("placeOrderAction", () => {
    beforeEach(async () => {
      await signIn();
      await addToCartAction({}, form({ productId, qty: "1" }));
    });

    it("places and pays, then goes to the order", async () => {
      const to = await redirectTarget(
        placeOrderAction({}, form({ ...ADDRESS, paymentMethod: "test-approve" })),
      );

      const order = await OrderModel.findOne().lean();
      expect(to).toBe(`/account/orders/${order?._id}?result=placed`);
      expect(order?.isPaid).toBe(true);
    });

    it("keeps the order when the payment is declined", async () => {
      const to = await redirectTarget(
        placeOrderAction({}, form({ ...ADDRESS, paymentMethod: "test-decline" })),
      );

      const order = await OrderModel.findOne().lean();
      expect(to).toContain("result=declined");
      expect(order).toMatchObject({ isPaid: false, status: "pending" });
      expect((await getCart(userId)).items).toEqual([]);
    });

    it("keeps what was typed and the chosen payment method on a validation error", async () => {
      const result = await placeOrderAction(
        {},
        form({ ...ADDRESS, city: "", paymentMethod: "test-decline" }),
      );

      expect(result.fieldErrors).toHaveProperty("city", "City is required");
      expect(result.values).toMatchObject({
        fullName: "Ada Lovelace",
        paymentMethod: "test-decline",
      });
      await expect(OrderModel.countDocuments()).resolves.toBe(0);
    });

    it("rejects an unknown payment method", async () => {
      const result = await placeOrderAction(
        {},
        form({ ...ADDRESS, paymentMethod: "free" }),
      );

      expect(result.fieldErrors).toHaveProperty("paymentMethod");
    });

    it("explains an empty cart instead of crashing", async () => {
      await placeOrderAction({}, form({ ...ADDRESS, paymentMethod: "test-approve" })).catch(
        () => undefined,
      );

      const result = await placeOrderAction(
        {},
        form({ ...ADDRESS, paymentMethod: "test-approve" }),
      );

      expect(result.error).toBe("Your cart is empty");
    });
  });

  describe("retryPaymentAction", () => {
    it("cannot pay for someone else's order", async () => {
      await signIn();
      await addToCartAction({}, form({ productId, qty: "1" }));
      await placeOrderAction(
        {},
        form({ ...ADDRESS, paymentMethod: "test-decline" }),
      ).catch(() => undefined);
      const order = await OrderModel.findOne().lean();

      const eve = await UserModel.create({
        name: "Eve",
        email: "eve@example.com",
        password: "correct-horse",
      });
      await setSessionCookie({
        userId: String(eve._id),
        role: "customer",
        tokenVersion: 0,
      });

      const result = await retryPaymentAction(
        String(order?._id),
        {},
        form({ paymentMethod: "test-approve" }),
      );

      expect(result.error).toBeDefined();
      await expect(OrderModel.findById(order?._id).lean()).resolves.toMatchObject({
        isPaid: false,
      });
    });
  });

  describe("changePasswordAction", () => {
    beforeEach(signIn);

    it("refuses without the current password", async () => {
      const result = await changePasswordAction(
        {},
        form({ currentPassword: "wrong", newPassword: "brand-new-password" }),
      );

      expect(result.fieldErrors).toHaveProperty("currentPassword");

      const user = await UserModel.findById(userId).select("+password");
      await expect(user?.matchPassword("correct-horse")).resolves.toBe(true);
    });

    it("changes the password and keeps this session valid", async () => {
      const result = await changePasswordAction(
        {},
        form({ currentPassword: "correct-horse", newPassword: "brand-new-password" }),
      );

      expect(result.saved).toBeDefined();

      const user = await UserModel.findById(userId).select("+password");
      await expect(user?.matchPassword("brand-new-password")).resolves.toBe(true);
    });
  });
});
