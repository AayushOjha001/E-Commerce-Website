"use client";

import { useActionState } from "react";

import { INPUT_CLASS, Notice, buttonClass } from "@/components/ui";
import {
  changePasswordAction,
  updateProfileAction,
  type AccountFormState,
} from "@/server/auth/account-actions";

type Field = {
  name: string;
  label: string;
  type: "text" | "email" | "password";
  autoComplete: string;
  defaultValue?: string;
};

function AccountForm({
  title,
  submitLabel,
  fields,
  action,
}: {
  title: string;
  submitLabel: string;
  fields: Field[];
  action: (
    state: AccountFormState,
    formData: FormData,
  ) => Promise<AccountFormState>;
}) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <h2 className="text-xl font-bold">{title}</h2>

      {state.error ? <Notice>{state.error}</Notice> : null}
      {state.saved ? <Notice tone="success">{state.saved}</Notice> : null}

      {fields.map((field) => {
        const error = state.fieldErrors?.[field.name];

        return (
          <div key={field.name}>
            <label htmlFor={field.name} className="mb-1 block font-medium">
              {field.label}
            </label>
            <input
              id={field.name}
              name={field.name}
              type={field.type}
              autoComplete={field.autoComplete}
              defaultValue={state.values?.[field.name] ?? field.defaultValue}
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

      <button type="submit" disabled={isPending} className={buttonClass()}>
        {isPending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export function ProfileForm({ name, email }: { name: string; email: string }) {
  return (
    <AccountForm
      title="Your details"
      submitLabel="Save details"
      action={updateProfileAction}
      fields={[
        { name: "name", label: "Name", type: "text", autoComplete: "name", defaultValue: name },
        { name: "email", label: "Email", type: "email", autoComplete: "email", defaultValue: email },
        {
          name: "emailPassword",
          label: "Current password (only to change your email)",
          type: "password",
          autoComplete: "current-password",
        },
      ]}
    />
  );
}

export function PasswordForm() {
  return (
    <AccountForm
      title="Change password"
      submitLabel="Change password"
      action={changePasswordAction}
      fields={[
        {
          name: "currentPassword",
          label: "Current password",
          type: "password",
          autoComplete: "current-password",
        },
        {
          name: "newPassword",
          label: "New password",
          type: "password",
          autoComplete: "new-password",
        },
      ]}
    />
  );
}
