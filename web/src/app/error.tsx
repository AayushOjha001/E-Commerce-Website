"use client";

/**
 * Error boundary for the app.
 *
 * Shows a fixed message: the underlying error must not be rendered, for the same
 * reason the API never serialises one (audit B6). Next.js already strips error
 * details in production, but being explicit keeps it true in development too,
 * where the message would otherwise be shown verbatim.
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-3 text-black/60 dark:text-white/60">
        That request could not be completed. Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-500"
      >
        Try again
      </button>
    </main>
  );
}
