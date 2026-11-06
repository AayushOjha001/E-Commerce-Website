/** Holds the page's shape while the catalog loads, so nothing jumps. */
export default function ProductsLoading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-12 sm:px-6"
    >
      <p className="display text-3xl text-ink/30 sm:text-5xl">Loading products</p>

      <div className="mt-20 grid gap-8 lg:grid-cols-[240px_1fr]">
        <div aria-hidden className="hidden h-96 bg-ink/5 lg:block" />
        <div aria-hidden className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div
              key={index}
              className="aspect-[4/5] bg-ink/5 even:bg-ink/10"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
