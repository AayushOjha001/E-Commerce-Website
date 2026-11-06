import { z } from "zod";

import { PRODUCT_SORTS, type ListProductsOptions } from "./products";

/**
 * Turning a query string into catalog options, in one place, so the API route
 * and the catalog page cannot disagree about what `?sort=` means.
 *
 * They differ on purpose in one way. The API is strict: a bad parameter is a 400,
 * so a client finds out about its bug. The page is lenient: a visitor with a
 * mangled link still gets a catalog, with the bad parameter ignored.
 */

export const MAX_SEARCH_LENGTH = 100;

// Matched as text first: `Number()` alone also accepts "0x10", "1e3" and "".
const decimal = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/)
  .transform(Number)
  .pipe(z.number().finite());

const wholeNumber = z
  .string()
  .trim()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1));

const fields = {
  page: wholeNumber,
  limit: wholeNumber,
  search: z.string().trim().min(1).max(MAX_SEARCH_LENGTH),
  category: z.string().trim().toLowerCase().min(1).max(120),
  minPrice: decimal,
  maxPrice: decimal,
  sort: z.enum(PRODUCT_SORTS),
};

type Field = keyof typeof fields;
const FIELD_NAMES = Object.keys(fields) as Field[];

const strictSchema = z.object(
  Object.fromEntries(
    FIELD_NAMES.map((name) => [name, fields[name].optional()]),
  ) as { [K in Field]: z.ZodOptional<(typeof fields)[K]> },
);

/** Parses API query parameters. Throws a `ZodError` (mapped to a 400). */
export function parseCatalogQuery(params: URLSearchParams): ListProductsOptions {
  const raw: Record<string, string> = {};

  for (const name of FIELD_NAMES) {
    const value = params.get(name);
    // An empty parameter means "not set", which is what a form with a blank
    // field submits.
    if (value !== null && value !== "") raw[name] = value;
  }

  return strictSchema.parse(raw);
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * Parses page search params, dropping anything invalid instead of failing.
 *
 * A repeated parameter (`?category=a&category=b`) arrives as an array; the first
 * value is used. An inverted price range is dropped too, since `listProducts`
 * would otherwise throw and turn a bad link into an error page.
 *
 * `limit` is API-only. The page's links do not carry it, so honouring it here
 * would compute the page count from one size and fetch the next page at another,
 * skipping products.
 */
export function parseCatalogPageParams(
  params: RawSearchParams,
): ListProductsOptions {
  const options: Record<string, unknown> = {};

  for (const name of FIELD_NAMES) {
    if (name === "limit") continue;

    const raw = params[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === "") continue;

    const parsed = fields[name].safeParse(value);
    if (parsed.success) options[name] = parsed.data;
  }

  const result = options as ListProductsOptions;

  if (
    result.minPrice !== undefined &&
    result.maxPrice !== undefined &&
    result.minPrice > result.maxPrice
  ) {
    delete result.minPrice;
    delete result.maxPrice;
  }

  return result;
}
