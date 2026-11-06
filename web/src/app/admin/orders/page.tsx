import type { Metadata } from "next";
import Link from "next/link";

import { OrderActions } from "@/components/admin-forms";
import { OrderStatusPill } from "@/components/order-status";
import { Pagination } from "@/components/pagination";
import { LINK_CLASS, PageTitle } from "@/components/ui";
import { formatDate, formatPrice } from "@/lib/format";
import { requireAdminForPage } from "@/server/auth/session";
import { ORDER_STATUSES } from "@/server/models/order";
import {
  ORDER_TRANSITIONS,
  isOrderStatus,
  listAllOrders,
} from "@/server/services/orders-admin";

export const metadata: Metadata = { title: "Orders" };

const FILTERS = [
  { label: "All", value: undefined },
  ...ORDER_STATUSES.map((status) => ({
    label: status.charAt(0).toUpperCase() + status.slice(1),
    value: status,
  })),
];

function ordersHref(status: string | undefined, page?: number): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (page && page > 1) params.set("page", String(page));

  const query = params.toString();
  return query ? `/admin/orders?${query}` : "/admin/orders";
}

export default async function AdminOrdersPage(
  props: PageProps<"/admin/orders">,
) {
  await requireAdminForPage("/admin/orders");

  const { status: rawStatus, page: rawPage } = await props.searchParams;
  const status = isOrderStatus(rawStatus) ? rawStatus : undefined;
  const requestedPage = Number(rawPage);

  const page = await listAllOrders({
    status,
    page: Number.isInteger(requestedPage) ? requestedPage : 1,
  });

  return (
    <main>
      <PageTitle>Orders</PageTitle>

      <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-1">
        {FILTERS.map((filter) => (
          <li key={filter.label}>
            <Link
              href={ordersHref(filter.value)}
              aria-current={filter.value === status ? "true" : undefined}
              className="underline-offset-4 hover:underline aria-[current]:font-bold aria-[current]:underline"
            >
              {filter.label}
            </Link>
          </li>
        ))}
      </ul>

      {page.items.length === 0 ? (
        <p className="mt-6 text-lg">No orders here.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-b-2 border-ink">
                <th scope="col" className="py-2 pr-4 font-semibold">Order</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Date</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Customer</th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">Total</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
                <th scope="col" className="py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((order) => (
                <tr key={order.id} className="border-b-2 border-ink/10 align-top">
                  <td className="py-2 pr-4">
                    <Link href={`/account/orders/${order.id}`} className={LINK_CLASS}>
                      {order.number}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{formatDate(order.createdAt)}</td>
                  <td className="py-2 pr-4">
                    {order.customerName}
                    <span className="block text-sm text-ink-soft">
                      {order.customerEmail}
                    </span>
                  </td>
                  <td className="price py-2 pr-4 text-right font-semibold">
                    {formatPrice(order.totalPrice)}
                  </td>
                  <td className="py-2 pr-4">
                    <OrderStatusPill status={order.status} />
                  </td>
                  <td className="py-2">
                    <OrderActions
                      id={order.id}
                      number={order.number}
                      nextStatuses={ORDER_TRANSITIONS[order.status]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page.page}
        totalPages={page.totalPages}
        hrefForPage={(target) => ordersHref(status, target)}
      />
    </main>
  );
}
