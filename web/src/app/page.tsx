import Link from "next/link";

// Placeholder home page. Batch 4 (T4.3) replaces this with the real catalog,
// rendered as a server component from the database.
export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">E-Shop</h1>
      <p className="text-foreground/70">
        Next.js storefront under construction. The catalog, cart and checkout
        arrive in later batches.
      </p>
      <Link
        href="/api/health"
        className="text-sm font-medium text-blue-600 underline underline-offset-4 hover:text-blue-500"
      >
        Check API health
      </Link>
    </main>
  );
}
