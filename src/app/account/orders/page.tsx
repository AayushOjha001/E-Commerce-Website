import type { Metadata } from "next";
import Link from "next/link";

import { OrderStatusPill } from "@/components/order-status";
import { PageTitle, buttonClass } from "@/components/ui";
import { formatDate, formatPrice, pluralise } from "@/lib/format";
import { requireUserForPage } from "@/server/auth/session";
import { listOrdersForUser, orderNumber } from "@/server/services/orders";

export const metadata: Metadata = { title: "Your orders" };

export default async function OrdersPage() {
  const user = await requireUserForPage("/account/orders");
  const orders = await listOrdersForUser(user.id);

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-12 sm:px-6">
      <PageTitle>Your orders</PageTitle>

      {orders.length === 0 ? (
        <div className="mt-6">
          <p className="text-lg">You have not placed an order yet.</p>
          <Link href="/products" className={buttonClass({ className: "mt-4" })}>
            Browse all products
          </Link>
        </div>
      ) : (
        <ul className="mt-6 max-w-3xl divide-y-2 divide-ink/10">
          {orders.map((order) => {
            const id = String(order._id);

            return (
              <li key={id}>
                <Link
                  href={`/account/orders/${id}`}
                  className="group flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-4"
                >
                  <span>
                    <span className="text-lg font-semibold underline-offset-4 group-hover:underline">
                      Order {orderNumber(id)}
                    </span>
                    <span className="block text-ink-soft">
                      {formatDate(order.createdAt)},{" "}
                      {pluralise(order.itemCount, "item")}
                    </span>
                  </span>
                  <span className="flex items-center gap-4">
                    <OrderStatusPill status={order.status} />
                    <span className="price text-lg font-bold">
                      {formatPrice(order.totalPrice)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
