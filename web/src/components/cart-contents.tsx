"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";

import { ProductArt } from "@/components/product-art";
import { LINK_CLASS, Notice, buttonClass } from "@/components/ui";
import { applyCartChange, type CartChange } from "@/lib/cart-view";
import { departmentClass } from "@/lib/department";
import { formatPrice } from "@/lib/format";
import type { CartLine, CartView } from "@/server/services/cart";
import {
  FREE_SHIPPING_THRESHOLD,
  calculateOrderTotals,
} from "@/server/services/pricing";
import { removeCartItemAction, setCartQtyAction } from "@/server/shop/actions";

const MAX_QTY = 99;

function stockWarning(line: CartLine): string | null {
  if (!line.exceedsStock) return null;
  if (line.countInStock === 0) return "No longer available. Remove it to check out.";
  return `Only ${line.countInStock} left. Lower the quantity to check out.`;
}

function CartRow({
  line,
  onChange,
}: {
  line: CartLine;
  onChange: (change: CartChange) => void;
}) {
  const warning = stockWarning(line);
  const canIncrease = line.qty < Math.min(line.countInStock, MAX_QTY);

  return (
    <li className="grid grid-cols-[88px_1fr] gap-4 py-4 sm:grid-cols-[112px_1fr_auto]">
      <Link
        href={`/products/${line.slug}`}
        data-field
        className={`block self-start p-1 ${departmentClass(line.categorySlug)}`}
      >
        <ProductArt src={line.image} alt="" size={112} className="w-full" />
        <span className="sr-only">{line.name}</span>
      </Link>

      <div className="min-w-0">
        <Link
          href={`/products/${line.slug}`}
          className="text-lg leading-tight font-semibold underline-offset-4 hover:underline"
        >
          {line.name}
        </Link>
        <p className="price text-ink-soft">{formatPrice(line.price)} each</p>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label={`Quantity of ${line.name}`}
            className="inline-flex items-center rounded-md bg-ink/10"
          >
            <button
              type="button"
              aria-label={`Remove one ${line.name}`}
              disabled={line.qty <= 1}
              onClick={() =>
                onChange({ type: "qty", productId: line.productId, qty: line.qty - 1 })
              }
              className="size-9 rounded-md text-lg font-bold hover:bg-ink/10 disabled:opacity-40"
            >
              −
            </button>
            <span aria-live="polite" className="price min-w-8 text-center font-semibold">
              {line.qty}
            </span>
            <button
              type="button"
              aria-label={`Add one ${line.name}`}
              disabled={!canIncrease}
              onClick={() =>
                onChange({ type: "qty", productId: line.productId, qty: line.qty + 1 })
              }
              className="size-9 rounded-md text-lg font-bold hover:bg-ink/10 disabled:opacity-40"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={() => onChange({ type: "remove", productId: line.productId })}
            className="font-medium underline underline-offset-4 hover:text-danger"
          >
            Remove<span className="sr-only"> {line.name}</span>
          </button>
        </div>

        {warning ? (
          <p className="mt-2 text-sm font-semibold text-danger">{warning}</p>
        ) : null}
      </div>

      <p className="price col-start-2 text-lg font-bold sm:col-start-3 sm:text-right">
        {formatPrice(line.lineTotal)}
      </p>
    </li>
  );
}

function FreeShippingMeter({ subtotal }: { subtotal: number }) {
  const remaining = FREE_SHIPPING_THRESHOLD - subtotal;
  const percent = Math.min((subtotal / FREE_SHIPPING_THRESHOLD) * 100, 100);

  return (
    <div>
      <p className="text-sm font-medium">
        {remaining > 0
          ? `Add ${formatPrice(remaining)} more for free shipping`
          : "Your order ships free"}
      </p>
      <div aria-hidden className="mt-1.5 h-2 bg-ink/15">
        <div className="h-full bg-ink" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function CartContents({ cart }: { cart: CartView }) {
  const [optimisticCart, applyChange] = useOptimistic(cart, applyCartChange);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  const handleChange = (change: CartChange) => {
    setError(undefined);

    startTransition(async () => {
      applyChange(change);

      const result =
        change.type === "remove"
          ? await removeCartItemAction(change.productId)
          : await setCartQtyAction(change.productId, change.qty);

      if (result.error) setError(result.error);
    });
  };

  if (optimisticCart.items.length === 0) {
    return (
      <div className="mt-6">
        <p className="text-lg">Your cart is empty.</p>
        <Link href="/products" className={buttonClass({ className: "mt-4" })}>
          Browse all products
        </Link>
      </div>
    );
  }

  const totals = calculateOrderTotals(optimisticCart.items);

  return (
    <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1fr_380px]">
      <div>
        {error ? <Notice>{error}</Notice> : null}
        <ul className="divide-y-2 divide-ink/10">
          {optimisticCart.items.map((line) => (
            <CartRow key={line.productId} line={line} onChange={handleChange} />
          ))}
        </ul>
      </div>

      <section aria-labelledby="summary" className="space-y-4 bg-white p-5">
        <h2 id="summary" className="text-xl font-bold">
          Summary
        </h2>

        <dl className="space-y-1">
          <div className="flex justify-between gap-4">
            <dt>Items ({optimisticCart.itemCount})</dt>
            <dd className="price">{formatPrice(totals.itemsPrice)}</dd>
          </div>
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

        <FreeShippingMeter subtotal={optimisticCart.subtotal} />

        {optimisticCart.hasIssues ? (
          <p className="font-semibold text-danger">
            Fix the items marked above to check out.
          </p>
        ) : (
          <Link href="/checkout" className={buttonClass({ size: "lg", className: "w-full" })}>
            Go to checkout
          </Link>
        )}
      </section>
    </div>
  );
}

export function SignInToViewCart() {
  return (
    <div className="mt-6">
      <p className="text-lg">Sign in to see your cart.</p>
      <p className="mt-4 flex flex-wrap items-center gap-4">
        <Link href="/login?next=%2Fcart" className={buttonClass()}>
          Sign in
        </Link>
        <Link href="/register?next=%2Fcart" className={LINK_CLASS}>
          Create an account
        </Link>
      </p>
    </div>
  );
}
