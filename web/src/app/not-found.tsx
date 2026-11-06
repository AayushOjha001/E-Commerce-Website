import Link from "next/link";

/**
 * The 404 page.
 *
 * Also what `proxy.ts` rewrites to when a signed-in non-admin asks for /admin,
 * so that surface looks simply absent rather than forbidden.
 */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-3 text-black/60 dark:text-white/60">
        That page does not exist, or you do not have access to it.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-500"
      >
        Back to the shop
      </Link>
    </main>
  );
}
