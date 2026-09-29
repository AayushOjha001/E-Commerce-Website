import type { Metadata } from "next";

import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Your account · E-Shop",
};

/**
 * The account page.
 *
 * Calls requireUser() even though proxy.ts already guards /account: the proxy is
 * a convenience that keeps a signed-out visitor from seeing an empty page, while
 * this is the check that actually has to hold. If the matcher were ever changed
 * or mistaken, the page still refuses to render.
 */
export default async function AccountPage() {
  const user = await requireUser();

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
