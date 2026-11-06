"use client";

import Link from "next/link";
import { useActionState } from "react";

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
      <h1 className="mb-6 text-2xl font-bold tracking-tight">{title}</h1>

      {state.error ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {state.error}
        </p>
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
                className="mb-1 block text-sm font-medium"
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
                className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-white/20"
              />
              {fieldError ? (
                <p id={errorId} className="mt-1 text-sm text-red-700 dark:text-red-300">
                  {fieldError}
                </p>
              ) : null}
            </div>
          );
        })}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? pendingLabel : submitLabel}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-black/60 dark:text-white/60">
        {footer.prompt}{" "}
        <Link
          href={footer.href}
          className="font-medium text-blue-600 underline underline-offset-4 hover:text-blue-500"
        >
          {footer.linkLabel}
        </Link>
      </p>
    </div>
  );
}
