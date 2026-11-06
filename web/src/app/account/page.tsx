import type { Metadata } from "next";
import Link from "next/link";

import { PasswordForm, ProfileForm } from "@/components/account-forms";
import { OrderStatusPill } from "@/components/order-status";
import { LINK_CLASS, PageTitle } from "@/components/ui";
import { formatDate, formatPrice } from "@/lib/format";
import { requireUserForPage } from "@/server/auth/session";
import { listOrdersForUser, orderNumber } from "@/server/services/orders";

export const metadata: Metadata = {
  title: "Your account",
};

/** How many orders the account page previews before linking to the full list. */
const RECENT_ORDERS = 3;

/**
 * The account page.
 *
 * Checks for itself even though proxy.ts already guards /account: the proxy is a
 * convenience, this is the check that has to hold. It uses the *page* variant,
 * which redirects — a Server Component that throws hits the error boundary and
 * renders a 500 instead of a login form, which is reachable whenever a token
 * outlives its account (a reseed is enough).
 */
export default async function AccountPage() {
  const user = await requireUserForPage("/account");
  const orders = await listOrdersForUser(user.id);

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-12 sm:px-6">
      <PageTitle>Your account</PageTitle>

      <div className="mt-8 grid items-start gap-10 lg:grid-cols-2">
        <section aria-labelledby="recent-orders">
          <h2 id="recent-orders" className="text-xl font-bold">
            Recent orders
          </h2>

          {orders.length === 0 ? (
            <p className="mt-2">
              No orders yet.{" "}
              <Link href="/products" className={LINK_CLASS}>
                Browse all products
              </Link>
            </p>
          ) : (
            <>
              <ul className="mt-2 divide-y-2 divide-ink/10">
                {orders.slice(0, RECENT_ORDERS).map((order) => {
                  const id = String(order._id);

                  return (
                    <li key={id}>
                      <Link
                        href={`/account/orders/${id}`}
                        className="group flex flex-wrap items-center justify-between gap-x-4 py-3"
                      >
                        <span>
                          <span className="font-semibold underline-offset-4 group-hover:underline">
                            Order {orderNumber(id)}
                          </span>
                          <span className="block text-sm text-ink-soft">
                            {formatDate(order.createdAt)}
                          </span>
                        </span>
                        <span className="flex items-center gap-3">
                          <OrderStatusPill status={order.status} />
                          <span className="price font-bold">
                            {formatPrice(order.totalPrice)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3">
                <Link href="/account/orders" className={LINK_CLASS}>
                  See all orders
                </Link>
              </p>
            </>
          )}
        </section>

        <div className="space-y-10">
          <ProfileForm name={user.name} email={user.email} />
          <PasswordForm />
        </div>
      </div>
    </main>
  );
}
