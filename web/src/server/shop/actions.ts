"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { safeRedirectPath } from "@/lib/redirect";
import { getCurrentUser } from "@/server/auth/session";
import { addToCart, removeFromCart, setCartItemQty } from "@/server/services/cart";
import { isServiceError } from "@/server/services/errors";
import { createOrderFromCart, payOrder } from "@/server/services/orders";
import { cancelOwnOrder, releaseExpiredOrders } from "@/server/services/orders-admin";
import {
  addToCartSchema,
  checkoutSchema,
  objectIdSchema,
  paySchema,
  setCartQtySchema,
} from "@/server/services/shop-schemas";

/**
 * Server actions for the cart and checkout.
 *
 * They call the same services as the route handlers, so each rule has one
 * implementation. Every action resolves the user from the session itself: a
 * user id arriving from a form would be a client-supplied claim of identity.
 */

export type ActionResult = { error?: string; added?: boolean };

export type CheckoutFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

/** Refreshes the page and the cart count in the header. */
function refreshCart(): void {
  revalidatePath("/", "layout");
}

function userError(error: unknown): string {
  if (isServiceError(error)) return error.message;
  throw error;
}

export async function addToCartAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();

  if (!user) {
    const back = safeRedirectPath(formData.get("returnTo"));
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  const parsed = addToCartSchema.safeParse({
    productId: formData.get("productId"),
    qty: Number(formData.get("qty") ?? 1),
  });
  if (!parsed.success) return { error: "Choose a valid quantity" };

  try {
    await addToCart(user.id, parsed.data.productId, parsed.data.qty);
  } catch (error) {
    return { error: userError(error) };
  }

  refreshCart();
  return { added: true };
}

export async function setCartQtyAction(
  productId: string,
  qty: number,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fcart");

  const id = objectIdSchema.safeParse(productId);
  const parsed = setCartQtySchema.safeParse({ qty });
  if (!id.success || !parsed.success) return { error: "Choose a valid quantity" };

  try {
    await setCartItemQty(user.id, id.data, parsed.data.qty);
  } catch (error) {
    // Refresh even on failure: the optimistic quantity has to snap back.
    refreshCart();
    return { error: userError(error) };
  }

  refreshCart();
  return {};
}

export async function removeCartItemAction(
  productId: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fcart");

  const id = objectIdSchema.safeParse(productId);
  if (!id.success) return { error: "That item could not be found" };

  try {
    await removeFromCart(user.id, id.data);
  } catch (error) {
    refreshCart();
    return { error: userError(error) };
  }

  refreshCart();
  return {};
}

const ADDRESS_FIELDS = [
  "fullName",
  "address",
  "city",
  "postalCode",
  "country",
  "phone",
] as const;

export async function placeOrderAction(
  _previous: CheckoutFormState,
  formData: FormData,
): Promise<CheckoutFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fcheckout");

  const address = Object.fromEntries(
    ADDRESS_FIELDS.map((field) => [field, String(formData.get(field) ?? "")]),
  );
  const paymentMethod = String(formData.get("paymentMethod") ?? "");

  // Echoed back with the address: React resets a form after its action runs, so
  // without this a failed submit would quietly change the chosen payment method.
  const values = { ...address, paymentMethod };

  const parsed = checkoutSchema.safeParse({
    shippingAddress: address,
    paymentMethod,
    expectedTotal: Number(formData.get("expectedTotal")),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path.at(-1) ?? "_");
      fieldErrors[key] ??= issue.message;
    }
    return { error: "Check the highlighted fields", fieldErrors, values };
  }

  await releaseExpiredOrders();

  let orderId: string;
  try {
    const order = await createOrderFromCart(user.id, parsed.data);
    orderId = String(order._id);
  } catch (error) {
    // Refreshed so the summary and button show the figures that caused this.
    refreshCart();
    return { error: userError(error), values };
  }

  // The order exists from here on and the cart is empty, so every outcome has to
  // end on the order page. Anything else strands the shopper at an empty cart
  // with no sign of the order they just placed.
  let outcome = "placed";
  try {
    await payOrder(orderId, user.id, {
      paymentMethod: parsed.data.paymentMethod,
    });
  } catch (error) {
    if (isServiceError(error) && error.code === "payment_declined") {
      outcome = "declined";
    } else {
      console.error("[checkout] payment failed:", error);
      outcome = "failed";
    }
  }

  refreshCart();
  redirect(`/account/orders/${orderId}?result=${outcome}`);
}

export async function retryPaymentAction(
  orderId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Faccount%2Forders");

  const id = objectIdSchema.safeParse(orderId);
  if (!id.success) return { error: "That order could not be found" };

  const parsed = paySchema.safeParse({
    paymentMethod: formData.get("paymentMethod"),
  });
  if (!parsed.success) return { error: "Choose a payment method" };

  try {
    await payOrder(id.data, user.id, parsed.data);
  } catch (error) {
    revalidatePath(`/account/orders/${id.data}`);
    return { error: userError(error) };
  }

  revalidatePath(`/account/orders/${id.data}`);
  redirect(`/account/orders/${id.data}?result=placed`);
}

export async function cancelOrderAction(orderId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Faccount%2Forders");

  const id = objectIdSchema.safeParse(orderId);
  if (!id.success) return { error: "That order could not be found" };

  try {
    await cancelOwnOrder(id.data, user.id);
  } catch (error) {
    return { error: userError(error) };
  }

  refreshCart();
  redirect(`/account/orders/${id.data}?result=cancelled`);
}
