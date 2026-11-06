import Link from "next/link";

import { LINK_CLASS, PageTitle } from "@/components/ui";
import { formatPrice, pluralise } from "@/lib/format";
import { requireAdminForPage } from "@/server/auth/session";
import {
  getDashboardStats,
  releaseExpiredOrders,
} from "@/server/services/orders-admin";

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="bg-white p-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="price mt-1 text-3xl font-bold">
        {href ? (
          <Link href={href} className="underline-offset-4 hover:underline">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

export default async function AdminPage() {
  await requireAdminForPage("/admin");
  await releaseExpiredOrders();
  const stats = await getDashboardStats();

  return (
    <main>
      <PageTitle>Overview</PageTitle>

      <dl className="mt-6 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="To ship" value={String(stats.toShip)} href="/admin/orders?status=paid" />
        <Stat
          label="Awaiting payment"
          value={String(stats.awaitingPayment)}
          href="/admin/orders?status=pending"
        />
        <Stat label="Revenue" value={formatPrice(stats.revenue)} />
        <Stat
          label="All orders"
          value={String(stats.orderCount)}
          href="/admin/orders"
        />
      </dl>

      <section aria-labelledby="low-stock" className="mt-10 max-w-2xl">
        <h2 id="low-stock" className="text-xl font-bold">
          Low stock
        </h2>

        {stats.lowStock.length === 0 ? (
          <p className="mt-2">
            All {pluralise(stats.productCount, "product")} are well stocked.
          </p>
        ) : (
          <ul className="mt-2 divide-y-2 divide-ink/10">
            {stats.lowStock.map((product) => (
              <li key={product.id} className="flex items-center justify-between gap-4 py-2">
                <Link href={`/admin/products/${product.id}`} className={LINK_CLASS}>
                  {product.name}
                </Link>
                <span
                  className={`price font-semibold ${product.countInStock === 0 ? "text-danger" : ""}`}
                >
                  {product.countInStock === 0
                    ? "Out of stock"
                    : `${product.countInStock} left`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
