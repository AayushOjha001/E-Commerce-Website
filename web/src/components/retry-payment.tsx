"use client";

import { useActionState } from "react";

import { Notice, buttonClass } from "@/components/ui";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "@/server/payments/provider";
import { retryPaymentAction } from "@/server/shop/actions";

export function RetryPayment({ orderId }: { orderId: string }) {
  const [state, formAction, isPending] = useActionState(
    retryPaymentAction.bind(null, orderId),
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <h2 className="text-xl font-bold">Pay for this order</h2>
      {state.error ? <Notice>{state.error}</Notice> : null}

      <div className="space-y-2">
        {PAYMENT_METHODS.map((method, index) => (
          <label
            key={method}
            className="flex cursor-pointer items-center gap-3 rounded-md bg-paper p-3 font-medium has-[:checked]:shadow-[inset_0_0_0_2px_var(--color-cobalt)]"
          >
            <input
              type="radio"
              name="paymentMethod"
              value={method}
              defaultChecked={index === 0}
              className="size-4 accent-cobalt"
            />
            {PAYMENT_METHOD_LABELS[method]}
          </label>
        ))}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className={buttonClass({ className: "w-full" })}
      >
        {isPending ? "Paying…" : "Pay now"}
      </button>
    </form>
  );
}
