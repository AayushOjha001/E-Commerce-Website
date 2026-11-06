import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderProgress, OrderStatusPill } from "@/components/order-status";
import { ProductArt } from "@/components/product-art";
import { RetryPayment } from "@/components/retry-payment";
import { Notice, PageTitle } from "@/components/ui";
import { formatDate, formatPrice } from "@/lib/format";
import { requireUserForPage } from "@/server/auth/session";
import { isServiceError } from "@/server/services/errors";
import { UNPAID_ORDER_TTL_MINUTES } from "@/server/services/orders-admin";
import {
  getOrderForUser,
  orderNumber,
  toPublicOrder,
} from "@/server/services/orders";

export async function generateMetadata(
  props: PageProps<"/account/orders/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  return { title: `Order ${orderNumber(id)}` };
}

async function loadOrder(id: string, userId: string, isAdmin: boolean) {
  try {
    const order = await getOrderForUser(id, userId, { isAdmin });

    return {
      order: toPublicOrder(order),
      isOwner: String(order.user) === userId,
    };
  } catch (error) {
    // Someone else's order and a missing one look identical here, on purpose.
    if (isServiceError(error)) notFound();
    throw error;
  }
}

export default async function OrderPage(props: PageProps<"/account/orders/[id]">) {
  const { id } = await props.params;
  const { result } = await props.searchParams;

  const user = await requireUserForPage(`/account/orders/${id}`);
  const { order, isOwner } = await loadOrder(id, user.id, user.role === "admin");
  const awaitingPayment = order.status === "pending";

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-12 sm:px-6">
      <Link
        href="/account/orders"
        className="font-medium underline-offset-4 hover:underline"
      >
        Your orders
      </Link>

      <PageTitle className="mt-3">Order {order.number}</PageTitle>
      <p className="mt-2 flex flex-wrap items-center gap-3 text-ink-soft">
        <span>Placed {formatDate(order.createdAt)}</span>
        <OrderStatusPill status={order.status} />
      </p>

      <div className="mt-6 max-w-2xl space-y-3">
        {result === "placed" && order.isPaid ? (
          <Notice tone="success">
            Your order is placed and paid. Thanks for shopping with us.
          </Notice>
        ) : null}
        {result === "declined" && awaitingPayment ? (
          <Notice>
            Your order is saved, but the payment was declined. Try paying again
            below.
          </Notice>
        ) : null}
        {result === "failed" && awaitingPayment ? (
          <Notice>
            Your order is saved, but the payment could not be completed. Try
            paying again below.
          </Notice>
        ) : null}
        {result === "cancelled" && order.status === "cancelled" ? (
          <Notice tone="success">Your order is cancelled.</Notice>
        ) : null}
        <OrderProgress status={order.status} />
      </div>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_380px]">
        <ul className="divide-y-2 divide-ink/10">
          {order.items.map((item) => (
            <li
              key={item.productId}
              className="grid grid-cols-[72px_1fr_auto] items-center gap-4 py-3"
            >
              {/* Neutral: colour means department, and an order line is a
                  snapshot that does not record one. */}
              <div className="bg-ink/10 p-1">
                <ProductArt src={item.image} alt="" size={72} className="w-full" />
              </div>
              <div>
                <p className="font-semibold">{item.name}</p>
                <p className="price text-ink-soft">
                  {item.qty} × {formatPrice(item.price)}
                </p>
              </div>
              <p className="price font-bold">{formatPrice(item.lineTotal)}</p>
            </li>
          ))}
        </ul>

        <div className="space-y-6 bg-white p-5">
          <section aria-labelledby="ship-to">
            <h2 id="ship-to" className="text-xl font-bold">
              Ship to
            </h2>
            <address className="mt-1 not-italic">
              {order.shippingAddress.fullName}
              <br />
              {order.shippingAddress.address}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.postalCode}
              <br />
              {order.shippingAddress.country}
              {order.shippingAddress.phone ? (
                <>
                  <br />
                  {order.shippingAddress.phone}
                </>
              ) : null}
            </address>
          </section>

          <section aria-labelledby="totals">
            <h2 id="totals" className="text-xl font-bold">
              Totals
            </h2>
            <dl className="mt-1 space-y-1">
              <div className="flex justify-between gap-4">
                <dt>Items</dt>
                <dd className="price">{formatPrice(order.itemsPrice)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Shipping</dt>
                <dd className="price">
                  {order.shippingPrice === 0
                    ? "Free"
                    : formatPrice(order.shippingPrice)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Tax</dt>
                <dd className="price">{formatPrice(order.taxPrice)}</dd>
              </div>
              <div className="flex justify-between gap-4 pt-2 text-xl font-bold">
                <dt>Total</dt>
                <dd className="price">{formatPrice(order.totalPrice)}</dd>
              </div>
            </dl>
          </section>

          {awaitingPayment && isOwner ? (
            <RetryPayment
              orderId={order.id}
              timeLimitMinutes={UNPAID_ORDER_TTL_MINUTES}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
