/** A title-shaped loading state for pages with no fixed layout to hold. */
export function PageLoading({ label }: { label: string }) {
  return (
    <main
      aria-busy="true"
      className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-12 sm:px-6"
    >
      <p role="status" className="display text-3xl text-ink-soft sm:text-5xl">
        {label}
      </p>
      <div aria-hidden className="mt-8 h-64 bg-ink/5" />
    </main>
  );
}
