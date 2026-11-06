import type { Metadata } from "next";

import { CartContents, SignInToViewCart } from "@/components/cart-contents";
import { PageTitle } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/session";
import { getCart } from "@/server/services/cart";

export const metadata: Metadata = { title: "Your cart" };

// Replaces the legacy CartScreen.jsx (audit P3), which rendered a fixed
// "No items yet." and read no data at all.
export default async function CartPage() {
  const user = await getCurrentUser();
  const cart = user ? await getCart(user.id) : null;

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-12 sm:px-6">
      <PageTitle>Your cart</PageTitle>
      {cart ? <CartContents cart={cart} /> : <SignInToViewCart />}
    </main>
  );
}
