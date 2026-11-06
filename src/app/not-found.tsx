import Link from "next/link";

import { PageTitle, buttonClass } from "@/components/ui";

/**
 * The 404 page.
 *
 * Also what `proxy.ts` rewrites to when a signed-in non-admin asks for /admin,
 * so that surface looks simply absent rather than forbidden.
 */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-16 sm:px-6">
      <PageTitle>That page isn&apos;t on our shelves</PageTitle>
      <p className="mt-4 max-w-xl text-lg text-ink-soft">
        The link may be old, or you may not have access to it.
      </p>
      <Link href="/products" className={buttonClass({ className: "mt-6" })}>
        Browse all products
      </Link>
    </main>
  );
}
