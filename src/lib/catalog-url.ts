import type { ListProductsOptions } from "@/server/services/products";

type CatalogParams = Pick<
  ListProductsOptions,
  "search" | "category" | "sort" | "minPrice" | "maxPrice" | "page"
>;

/**
 * Builds a /products link from the current filters plus some changes.
 *
 * Changing a filter must drop `page`: staying on page 3 of a list that just
 * shrank to one page would show an empty catalog. So `page` survives only when
 * it is the thing being set.
 */
export function catalogHref(
  current: CatalogParams,
  changes: Partial<Record<keyof CatalogParams, string | number | undefined>> = {},
): string {
  const merged: Record<string, string | number | undefined> = {
    ...current,
    page: undefined,
    ...changes,
  };

  const params = new URLSearchParams();
  for (const key of ["search", "category", "sort", "minPrice", "maxPrice", "page"]) {
    const value = merged[key];
    if (value !== undefined && value !== "") params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `/products?${query}` : "/products";
}

/**
 * The page numbers to show: always the first, the last and the current page's
 * neighbours, with `null` marking a gap.
 */
export function paginationWindow(
  current: number,
  total: number,
): (number | null)[] {
  const pages = new Set(
    [1, total, current - 1, current, current + 1].filter(
      (page) => page >= 1 && page <= total,
    ),
  );

  const sorted = [...pages].sort((a, b) => a - b);
  const window: (number | null)[] = [];

  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && page - previous > 1) window.push(null);
    window.push(page);
  });

  return window;
}
