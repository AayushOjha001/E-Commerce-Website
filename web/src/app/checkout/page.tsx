import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CheckoutForm } from "@/components/checkout-form";
import { PageTitle } from "@/components/ui";
import { formatPrice } from "@/lib/format";
import { requireUserForPage } from "@/server/auth/session";
import { getCart } from "@/server/services/cart";
import { getLastShippingAddress } from "@/server/services/orders";
import { calculateOrderTotals } from "@/server/services/pricing";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const user = await requireUserForPage("/checkout");
  const [cart, lastAddress] = await Promise.all([
    getCart(user.id),
    getLastShippingAddress(user.id),
  ]);

  // The cart page explains both of these; there is nothing to do here.
  if (cart.items.length === 0 || cart.hasIssues) redirect("/cart");

  // For display only. Creating the order recomputes these from the database and
  // refuses to go ahead if the result differs from the total shown here.
  const totals = calculateOrderTotals(cart.items);

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-12 sm:px-6">
      <PageTitle>Checkout</PageTitle>

      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[1fr_380px]">
        <CheckoutForm
          initialAddress={lastAddress ?? { fullName: user.name }}
          total={totals.totalPrice}
        />

        <section aria-labelledby="summary" className="space-y-3 bg-white p-5 lg:order-last">
          <h2 id="summary" className="text-xl font-bold">
            Your order
          </h2>

          <ul className="space-y-1">
            {cart.items.map((line) => (
              <li key={line.productId} className="flex justify-between gap-4">
                <span>
                  {line.name}
                  {line.qty > 1 ? ` × ${line.qty}` : ""}
                </span>
                <span className="price">{formatPrice(line.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <dl className="space-y-1 border-t-2 border-ink/10 pt-3">
            <div className="flex justify-between gap-4">
              <dt>Shipping</dt>
              <dd className="price">
                {totals.shippingPrice === 0
                  ? "Free"
                  : formatPrice(totals.shippingPrice)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Tax</dt>
              <dd className="price">{formatPrice(totals.taxPrice)}</dd>
            </div>
            <div className="flex justify-between gap-4 pt-2 text-xl font-bold">
              <dt>Total</dt>
              <dd className="price">{formatPrice(totals.totalPrice)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
