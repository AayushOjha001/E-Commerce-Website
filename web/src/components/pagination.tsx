import Link from "next/link";

import { paginationWindow } from "@/lib/catalog-url";

const LINK = "price rounded-md px-3 py-1.5 font-semibold hover:bg-ink/10";

export function Pagination({
  page,
  totalPages,
  hrefForPage,
}: {
  page: number;
  totalPages: number;
  hrefForPage: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center gap-1 py-6">
      {page > 1 ? (
        <Link href={hrefForPage(page - 1)} rel="prev" className={LINK}>
          Previous
        </Link>
      ) : null}

      {paginationWindow(page, totalPages).map((entry, index) =>
        entry === null ? (
          <span key={`gap-${index}`} aria-hidden className="px-2 text-ink-soft">
            …
          </span>
        ) : entry === page ? (
          <span
            key={entry}
            aria-current="page"
            className="price rounded-md bg-ink px-3 py-1.5 font-semibold text-paper"
          >
            {entry}
          </span>
        ) : (
          <Link key={entry} href={hrefForPage(entry)} className={LINK}>
            {entry}
          </Link>
        ),
      )}

      {page < totalPages ? (
        <Link href={hrefForPage(page + 1)} rel="next" className={LINK}>
          Next
        </Link>
      ) : null}
    </nav>
  );
}
