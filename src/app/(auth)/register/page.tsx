import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { safeRedirectPath } from "@/lib/redirect";
import { registerAction } from "@/server/auth/actions";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create an E-Shop account.",
};

// Replaces the legacy RegisterScreen.jsx (audit P5).
export default async function RegisterPage(props: PageProps<"/register">) {
  const { next } = await props.searchParams;
  const destination = safeRedirectPath(next);

  if (await getCurrentUser()) {
    redirect(destination);
  }

  return (
    <AuthForm
      title="Create an account"
      submitLabel="Create account"
      pendingLabel="Creating account…"
      action={registerAction}
      next={destination}
      fields={[
        { name: "name", label: "Name", type: "text", autoComplete: "name" },
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        {
          name: "password",
          label: "Password",
          type: "password",
          autoComplete: "new-password",
        },
      ]}
      footer={{
        prompt: "Already have an account?",
        linkLabel: "Sign in",
        href: "/login",
      }}
    />
  );
}
