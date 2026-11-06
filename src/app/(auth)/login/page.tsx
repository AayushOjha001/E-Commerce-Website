import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { safeRedirectPath } from "@/lib/redirect";
import { loginAction } from "@/server/auth/actions";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your E-Shop account.",
};

// Replaces the legacy LoginScreen.jsx (audit P4), which posted to a hardcoded
// http://localhost:5000 with axios and stashed the JWT in localStorage.
export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  const destination = safeRedirectPath(next);

  // Already signed in: nothing to do here.
  if (await getCurrentUser()) {
    redirect(destination);
  }

  return (
    <AuthForm
      title="Sign in"
      submitLabel="Sign in"
      pendingLabel="Signing in…"
      action={loginAction}
      next={destination}
      fields={[
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        {
          name: "password",
          label: "Password",
          type: "password",
          autoComplete: "current-password",
        },
      ]}
      footer={{
        prompt: "New here?",
        linkLabel: "Create an account",
        href: "/register",
      }}
    />
  );
}
