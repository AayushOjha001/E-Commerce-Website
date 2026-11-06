import Link from "next/link";

import { PageTitle, buttonClass } from "@/components/ui";

export default function ProductNotFound() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-16 sm:px-6">
      <PageTitle>We don&apos;t stock that</PageTitle>
      <p className="mt-4 max-w-xl text-lg text-ink-soft">
        The product may have been removed, or the link may be wrong.
      </p>
      <Link href="/products" className={buttonClass({ className: "mt-6" })}>
        Browse all products
      </Link>
    </main>
  );
}
