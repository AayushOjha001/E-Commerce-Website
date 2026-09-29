"use server";

import { redirect } from "next/navigation";

import { safeRedirectPath } from "@/lib/redirect";

import { loginSchema, registerSchema } from "@/server/auth/schemas";
import {
  clearSessionCookie,
  setSessionCookie,
} from "@/server/auth/session";
import { isServiceError } from "@/server/services/errors";
import {
  findUserForLogin,
  registerCustomer,
  toPublicUser,
} from "@/server/services/users";

/**
 * Server actions behind the login and register forms.
 *
 * They share the service layer with the route handlers rather than calling the
 * API over HTTP, so there is one implementation of each rule and no round trip.
 */

export type AuthFormState = {
  /** Message shown above the form. */
  error?: string;
  /** Per-input messages, keyed by field name. */
  fieldErrors?: Record<string, string>;
  /** Echoed back so a failed submit does not clear what was typed. */
  values?: Record<string, string>;
};

function fieldErrorsFrom(error: unknown): AuthFormState | null {
  if (isServiceError(error)) {
    return { error: error.message, fieldErrors: error.details };
  }
  return null;
}

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const next = safeRedirectPath(formData.get("next"));
  const values = { email };

  const parsed = loginSchema.safeParse({
    email,
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      fieldErrors[key] ??= issue.message;
    }
    return { error: "Please check the form", fieldErrors, values };
  }

  const user = await findUserForLogin(parsed.data.email);

  // One message for both cases, so the form cannot be used to discover which
  // emails have accounts.
  if (!user || !(await user.matchPassword(parsed.data.password))) {
    return { error: "Invalid email or password", values };
  }

  const publicUser = toPublicUser(user);
  await setSessionCookie({ userId: publicUser.id, role: publicUser.role });

  // Outside any try/catch: redirect() signals by throwing, and catching it would
  // swallow the navigation and surface as a generic error instead.
  redirect(next);
}

export async function registerAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
  };
  const next = safeRedirectPath(formData.get("next"));

  const parsed = registerSchema.safeParse({
    ...values,
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      fieldErrors[key] ??= issue.message;
    }
    return { error: "Please check the form", fieldErrors, values };
  }

  let userId: string;
  let role: "customer" | "admin";
  try {
    const user = await registerCustomer(parsed.data);
    userId = user.id;
    role = user.role;
  } catch (error) {
    const mapped = fieldErrorsFrom(error);
    if (mapped) return { ...mapped, values };
    throw error;
  }

  await setSessionCookie({ userId, role });
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/");
}
