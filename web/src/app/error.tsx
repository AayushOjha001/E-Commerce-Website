"use client";

import { PageTitle, buttonClass } from "@/components/ui";

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
    <main className="mx-auto w-full max-w-[1400px] px-4 py-16 sm:px-6">
      <PageTitle>This page failed to load</PageTitle>
      <p className="mt-4 max-w-xl text-lg text-ink-soft">
        The shop could not finish that request. Try again, and if it keeps
        happening, come back in a few minutes.
      </p>
      <button
        type="button"
        onClick={reset}
        className={buttonClass({ className: "mt-6" })}
      >
        Try again
      </button>
    </main>
  );
}
