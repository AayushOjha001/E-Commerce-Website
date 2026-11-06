"use client";

import { useActionState } from "react";

import { INPUT_CLASS, Notice, buttonClass } from "@/components/ui";
import type { Address } from "@/server/models/address";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "@/server/payments/provider";
import { placeOrderAction } from "@/server/shop/actions";

const FIELDS: {
  name: keyof Address;
  label: string;
  autoComplete: string;
  required?: boolean;
  half?: boolean;
}[] = [
  { name: "fullName", label: "Full name", autoComplete: "name" },
  { name: "address", label: "Address", autoComplete: "street-address" },
  { name: "city", label: "City", autoComplete: "address-level2", half: true },
  { name: "postalCode", label: "Postal code", autoComplete: "postal-code", half: true },
  { name: "country", label: "Country", autoComplete: "country-name", half: true },
  { name: "phone", label: "Phone (optional)", autoComplete: "tel", required: false, half: true },
];

export function CheckoutForm({
  initialAddress,
  totalLabel,
}: {
  initialAddress: Partial<Address>;
  totalLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(placeOrderAction, {});
  const chosenMethod = state.values?.paymentMethod ?? PAYMENT_METHODS[0];

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {state.error ? <Notice>{state.error}</Notice> : null}

      <fieldset>
        <legend className="text-xl font-bold">Shipping address</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {FIELDS.map((field) => {
            const error = state.fieldErrors?.[field.name];

            return (
              <div key={field.name} className={field.half ? "" : "sm:col-span-2"}>
                <label htmlFor={field.name} className="mb-1 block font-medium">
                  {field.label}
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  type="text"
                  autoComplete={field.autoComplete}
                  required={field.required ?? true}
                  defaultValue={
                    state.values?.[field.name] ?? initialAddress[field.name] ?? ""
                  }
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${field.name}-error` : undefined}
                  className={INPUT_CLASS}
                />
                {error ? (
                  <p
                    id={`${field.name}-error`}
                    className="mt-1 text-sm font-medium text-danger"
                  >
                    {error}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xl font-bold">Payment</legend>
        <p className="mt-1 text-ink-soft">
          This is a demo store, so no card is needed and nothing is charged.
        </p>

        <div className="mt-3 space-y-2">
          {PAYMENT_METHODS.map((method) => (
            <label
              key={method}
              className="flex cursor-pointer items-center gap-3 rounded-md bg-white p-3 font-medium has-[:checked]:shadow-[inset_0_0_0_2px_var(--color-cobalt)]"
            >
              <input
                type="radio"
                name="paymentMethod"
                value={method}
                defaultChecked={method === chosenMethod}
                className="size-4 accent-cobalt"
              />
              {PAYMENT_METHOD_LABELS[method]}
            </label>
          ))}
        </div>
        {state.fieldErrors?.paymentMethod ? (
          <p className="mt-1 text-sm font-medium text-danger">
            {state.fieldErrors.paymentMethod}
          </p>
        ) : null}
      </fieldset>

      <button
        type="submit"
        disabled={isPending}
        className={buttonClass({ size: "lg", className: "w-full sm:w-auto" })}
      >
        {isPending ? "Placing order…" : `Place order, ${totalLabel}`}
      </button>
    </form>
  );
}
