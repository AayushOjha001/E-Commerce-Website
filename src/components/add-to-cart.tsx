"use client";

import Link from "next/link";
import { useActionState } from "react";

import { INPUT_CLASS, LINK_CLASS, Notice, buttonClass } from "@/components/ui";
import { addToCartAction } from "@/server/shop/actions";

/** The most a quantity menu offers. The cart page can go higher, within stock. */
const MAX_MENU_QTY = 10;

export function AddToCart({
  productId,
  countInStock,
  returnTo,
}: {
  productId: string;
  countInStock: number;
  returnTo: string;
}) {
  const [state, formAction, isPending] = useActionState(addToCartAction, {});
  const options = Math.min(countInStock, MAX_MENU_QTY);

  return (
    <form action={formAction} className="mt-6 space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="returnTo" value={returnTo} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-24">
          <label htmlFor="qty" className="mb-1 block font-medium">
            Quantity
          </label>
          <select id="qty" name="qty" defaultValue="1" className={INPUT_CLASS}>
            {Array.from({ length: options }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {index + 1}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className={buttonClass({ size: "lg", className: "flex-1 sm:flex-none" })}
        >
          {isPending ? "Adding…" : "Add to cart"}
        </button>
      </div>

      {state.error ? <Notice>{state.error}</Notice> : null}
      {state.added ? (
        <Notice tone="success">
          Added to your cart.{" "}
          <Link href="/cart" className={LINK_CLASS}>
            View cart
          </Link>
        </Notice>
      ) : null}
    </form>
  );
}
