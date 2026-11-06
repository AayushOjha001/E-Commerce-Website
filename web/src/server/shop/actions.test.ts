import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { clearDatabase, dbReachable, setupTestDatabase, teardownTestDatabase } from "@/test/db";

const jar = await vi.hoisted(async () => {
  const { createCookieJar } = await import("@/test/cookie-jar");
  return createCookieJar();
});

vi.mock("next/headers", () => ({ cookies: async () => jar.cookieStore }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

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

const {
  addToCartAction,
  cancelOrderAction,
  placeOrderAction,
  removeCartItemAction,
  retryPaymentAction,
  setCartQtyAction,
} = await import("./actions");
const { changePasswordAction, updateProfileAction } = await import(
  "@/server/auth/account-actions"
);
const { getCurrentUser, setSessionCookie, SESSION_COOKIE } = await import(
  "@/server/auth/session"
);
const { paymentProvider } = await import("@/server/payments/provider");
const { verifySessionToken } = await import("@/server/auth/tokens");
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
      expect(revalidatePath).toHaveBeenCalled();
    });

    it("rejects an id that is not a string, as a client could send", async () => {
      await signIn();

      const result = await setCartQtyAction({ $ne: null } as unknown as string, 1);

      expect(result.error).toBeDefined();
    });
  });

  describe("removeCartItemAction", () => {
    it("removes the line and refreshes the page", async () => {
      await signIn();
      await addToCartAction({}, form({ productId, qty: "1" }));
      revalidatePath.mockClear();

      await expect(removeCartItemAction(productId)).resolves.toEqual({});

      expect((await getCart(userId)).items).toEqual([]);
      expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    });
  });

  describe("placeOrderAction", () => {
    beforeEach(async () => {
      await signIn();
      await addToCartAction({}, form({ productId, qty: "1" }));
    });

    const CHECKOUT = { ...ADDRESS, paymentMethod: "test-approve", expectedTotal: "169.5" };

    it("places and pays, then goes to the order", async () => {
      const to = await redirectTarget(placeOrderAction({}, form(CHECKOUT)));

      const order = await OrderModel.findOne().lean();
      expect(to).toBe(`/account/orders/${order?._id}?result=placed`);
      expect(order?.isPaid).toBe(true);
    });

    it("refuses to charge a total the shopper was not shown", async () => {
      await ProductModel.updateOne({ _id: productId }, { price: 200 });

      const result = await placeOrderAction({}, form(CHECKOUT));

      expect(result.error).toContain("total changed");
      await expect(OrderModel.countDocuments()).resolves.toBe(0);
      expect((await ProductModel.findById(productId).lean())?.countInStock).toBe(3);
      expect((await getCart(userId)).itemCount).toBe(1);
      expect(revalidatePath).toHaveBeenCalled();
    });

    it("rejects a checkout with no expected total", async () => {
      const result = await placeOrderAction(
        {},
        form({ ...ADDRESS, paymentMethod: "test-approve" }),
      );

      expect(result.error).toBeDefined();
      await expect(OrderModel.countDocuments()).resolves.toBe(0);
    });

    it("still reaches the order when payment fails unexpectedly", async () => {
      const charge = vi
        .spyOn(paymentProvider, "charge")
        .mockRejectedValueOnce(new Error("provider down"));
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      revalidatePath.mockClear();

      const to = await redirectTarget(placeOrderAction({}, form(CHECKOUT)));

      const order = await OrderModel.findOne().lean();
      expect(to).toBe(`/account/orders/${order?._id}?result=failed`);
      expect(order).toMatchObject({ isPaid: false, status: "pending" });
      expect(revalidatePath).toHaveBeenCalled();

      charge.mockRestore();
      log.mockRestore();
    });

    it("releases expired orders first, so their stock can be bought", async () => {
      await ProductModel.updateOne({ _id: productId }, { countInStock: 1 });
      await redirectTarget(
        placeOrderAction({}, form({ ...CHECKOUT, paymentMethod: "test-decline" })),
      );
      expect((await ProductModel.findById(productId).lean())?.countInStock).toBe(0);

      // Around Mongoose, which protects createdAt from being changed.
      await OrderModel.collection.updateMany(
        {},
        { $set: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
      );

      // The cart is empty, so this order fails, but the sweep runs before that.
      await placeOrderAction({}, form(CHECKOUT));

      await expect(OrderModel.findOne().lean()).resolves.toMatchObject({
        status: "cancelled",
      });
      expect((await ProductModel.findById(productId).lean())?.countInStock).toBe(1);
    });

    it("keeps the order when the payment is declined", async () => {
      const to = await redirectTarget(
        placeOrderAction({}, form({ ...CHECKOUT, paymentMethod: "test-decline" })),
      );

      const order = await OrderModel.findOne().lean();
      expect(to).toContain("result=declined");
      expect(order).toMatchObject({ isPaid: false, status: "pending" });
      expect((await getCart(userId)).items).toEqual([]);
    });

    it("keeps what was typed and the chosen payment method on a validation error", async () => {
      const result = await placeOrderAction(
        {},
        form({ ...CHECKOUT, city: "", paymentMethod: "test-decline" }),
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
        form({ ...CHECKOUT, paymentMethod: "free" }),
      );

      expect(result.fieldErrors).toHaveProperty("paymentMethod");
    });

    it("explains an empty cart instead of crashing", async () => {
      await redirectTarget(placeOrderAction({}, form(CHECKOUT)));

      const result = await placeOrderAction({}, form(CHECKOUT));

      expect(result.error).toBe("Your cart is empty");
    });

    describe("after a declined payment", () => {
      let orderId: string;

      beforeEach(async () => {
        await redirectTarget(
          placeOrderAction({}, form({ ...CHECKOUT, paymentMethod: "test-decline" })),
        );
        orderId = String((await OrderModel.findOne().lean())?._id);
      });

      it("retries to success and refreshes the order page", async () => {
        revalidatePath.mockClear();

        const to = await redirectTarget(
          retryPaymentAction(orderId, {}, form({ paymentMethod: "test-approve" })),
        );

        expect(to).toBe(`/account/orders/${orderId}?result=placed`);
        expect(revalidatePath).toHaveBeenCalledWith(`/account/orders/${orderId}`);
      });

      it("reports a second decline as a message", async () => {
        const result = await retryPaymentAction(
          orderId,
          {},
          form({ paymentMethod: "test-decline" }),
        );

        expect(result.error).toContain("declined");
      });

      it("cancels and returns the stock", async () => {
        expect((await ProductModel.findById(productId).lean())?.countInStock).toBe(2);

        const to = await redirectTarget(cancelOrderAction(orderId));

        expect(to).toContain("result=cancelled");
        expect((await ProductModel.findById(productId).lean())?.countInStock).toBe(3);
      });
    });
  });

  describe("retryPaymentAction", () => {
    it("cannot pay for someone else's order", async () => {
      await signIn();
      await addToCartAction({}, form({ productId, qty: "1" }));
      await redirectTarget(
        placeOrderAction(
          {},
          form({ ...ADDRESS, paymentMethod: "test-decline", expectedTotal: "169.5" }),
        ),
      );
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

      // The old cookie is dead once the version bumps, so this proves a new one
      // was issued rather than merely that the password changed.
      await expect(getCurrentUser()).resolves.toMatchObject({ id: userId });
      const token = jar.cookieStore.get(SESSION_COOKIE)?.value ?? "";
      expect(verifySessionToken(token)?.tokenVersion).toBe(1);
    });
  });

  describe("updateProfileAction", () => {
    beforeEach(signIn);

    it("saves a new name with no password", async () => {
      const result = await updateProfileAction(
        {},
        form({ name: "Ada L.", email: "ada@example.com" }),
      );

      expect(result.saved).toBeDefined();
      await expect(UserModel.findById(userId).lean()).resolves.toMatchObject({
        name: "Ada L.",
      });
    });

    it("refuses to change the email without the password", async () => {
      const result = await updateProfileAction(
        {},
        form({ name: "Ada", email: "stolen@example.com" }),
      );

      expect(result.fieldErrors).toHaveProperty("emailPassword");
      await expect(UserModel.findById(userId).lean()).resolves.toMatchObject({
        email: "ada@example.com",
      });
    });

    it("changes the email with the password", async () => {
      const result = await updateProfileAction(
        {},
        form({
          name: "Ada",
          email: "new@example.com",
          emailPassword: "correct-horse",
        }),
      );

      expect(result.saved).toBeDefined();
    });

    it("keeps what was typed when the email is taken", async () => {
      await UserModel.create({
        name: "Eve",
        email: "taken@example.com",
        password: "correct-horse",
      });

      const result = await updateProfileAction(
        {},
        form({
          name: "Ada",
          email: "taken@example.com",
          emailPassword: "correct-horse",
        }),
      );

      expect(result.error).toContain("already exists");
      expect(result.values?.email).toBe("taken@example.com");
    });
  });
});
