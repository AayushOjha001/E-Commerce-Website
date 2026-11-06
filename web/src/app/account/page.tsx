import type { Metadata } from "next";

import { requireUserForPage } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Your account",
};

/**
 * The account page.
 *
 * Checks for itself even though proxy.ts already guards /account: the proxy is a
 * convenience, this is the check that has to hold. It uses the *page* variant,
 * which redirects — a Server Component that throws hits the error boundary and
 * renders a 500 instead of a login form, which is reachable whenever a token
 * outlives its account (a reseed is enough).
 */
export default async function AccountPage() {
  const user = await requireUserForPage("/account");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Your account</h1>

      <dl className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/15 dark:border-white/15">
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-black/60 dark:text-white/60">Name</dt>
          <dd className="font-medium">{user.name}</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-black/60 dark:text-white/60">Email</dt>
          <dd className="font-medium">{user.email}</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-black/60 dark:text-white/60">Role</dt>
          <dd className="font-medium">{user.role}</dd>
        </div>
      </dl>

      <p className="mt-6 text-sm text-black/60 dark:text-white/60">
        Order history arrives in a later batch.
      </p>
    </main>
  );
}
