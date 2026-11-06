"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  INPUT_CLASS,
  LINK_CLASS,
  Notice,
  PageTitle,
  buttonClass,
} from "@/components/ui";
import type { AuthFormState } from "@/server/auth/actions";

type Field = {
  name: string;
  label: string;
  type: "text" | "email" | "password";
  autoComplete: string;
  required?: boolean;
};

type AuthFormProps = {
  title: string;
  submitLabel: string;
  pendingLabel: string;
  fields: Field[];
  action: (
    state: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
  /** Where to go after success; passed through as a hidden input. */
  next: string;
  footer: { prompt: string; linkLabel: string; href: string };
};

/**
 * Shared login/register form.
 *
 * A client component only because it needs `useActionState` for the pending and
 * error states; the action itself runs on the server. The legacy screens each
 * hand-rolled the same axios call, loading flag and error string.
 */
export function AuthForm({
  title,
  submitLabel,
  pendingLabel,
  fields,
  action,
  next,
  footer,
}: AuthFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <PageTitle className="mb-8">{title}</PageTitle>

      {state.error ? (
        <div className="mb-4">
          <Notice>{state.error}</Notice>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />

        {fields.map((field) => {
          const fieldError = state.fieldErrors?.[field.name];
          const errorId = `${field.name}-error`;

          return (
            <div key={field.name}>
              <label
                htmlFor={field.name}
                className="mb-1 block font-medium"
              >
                {field.label}
              </label>
              <input
                id={field.name}
                name={field.name}
                type={field.type}
                autoComplete={field.autoComplete}
                required={field.required ?? true}
                defaultValue={state.values?.[field.name] ?? ""}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? errorId : undefined}
                className={INPUT_CLASS}
              />
              {fieldError ? (
                <p id={errorId} className="mt-1 text-sm font-medium text-danger">
                  {fieldError}
                </p>
              ) : null}
            </div>
          );
        })}

        <button
          type="submit"
          disabled={isPending}
          className={buttonClass({ className: "w-full" })}
        >
          {isPending ? pendingLabel : submitLabel}
        </button>
      </form>

      <p className="mt-6 text-ink-soft">
        {footer.prompt}{" "}
        <Link href={footer.href} className={LINK_CLASS}>
          {footer.linkLabel}
        </Link>
      </p>
    </div>
  );
}
