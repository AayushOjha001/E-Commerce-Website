"use client";

import { useActionState } from "react";

import { Notice, buttonClass } from "@/components/ui";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "@/server/payments/provider";
import { cancelOrderAction, retryPaymentAction } from "@/server/shop/actions";

export function RetryPayment({
  orderId,
  timeLimitMinutes,
}: {
  orderId: string;
  timeLimitMinutes: number;
}) {
  const [state, formAction, isPending] = useActionState(
    retryPaymentAction.bind(null, orderId),
    {},
  );
  const [cancelState, cancelAction, isCancelling] = useActionState(
    cancelOrderAction.bind(null, orderId),
    {},
  );
  const busy = isPending || isCancelling;

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3">
        <h2 className="text-xl font-bold">Pay for this order</h2>
        <p className="text-ink-soft">
          Unpaid orders are cancelled after {timeLimitMinutes} minutes, and the
          items go back on the shelves.
        </p>

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
          disabled={busy}
          className={buttonClass({ className: "w-full" })}
        >
          {isPending ? "Paying…" : "Pay now"}
        </button>
      </form>

      <form action={cancelAction}>
        {cancelState.error ? <Notice>{cancelState.error}</Notice> : null}
        <button
          type="submit"
          disabled={busy}
          className={buttonClass({ variant: "secondary", className: "w-full" })}
        >
          {isCancelling ? "Cancelling…" : "Cancel order"}
        </button>
      </form>
    </div>
  );
}
