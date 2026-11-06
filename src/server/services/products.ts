import type { QueryFilter, SortOrder } from "mongoose";
import { Types } from "mongoose";

import { connectDB } from "@/server/db/connect";
import { CategoryModel, ProductModel, type Product } from "@/server/models";
import { notFound, validationFailed } from "./errors";

export const PRODUCT_SORTS = [
  "newest",
  "price-asc",
  "price-desc",
  "rating",
  "relevance",
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 60;

export type ListProductsOptions = {
  page?: number;
  limit?: number;
  /** Free-text query, matched against the weighted product text index. */
  search?: string;
  /** Category **slug**, not id — that is what a URL carries. */
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  /** Include soft-deleted products. Admin listings only. */
  includeInactive?: boolean;
};

export type ProductListItem = Omit<Product, "category"> & {
  category: { _id: Types.ObjectId; name: string; slug: string } | null;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

/**
 * A product as it may cross a trust boundary.
 *
 * Plain JSON values only, so the same object serves an API response and a prop
 * passed to a client component, neither of which can carry an `ObjectId` or a
 * `Date`. Also drops Mongo internals (`__v`, the text-search `score`).
 */
export type PublicProduct = {
  id: string;
  name: string;
  slug: string;
  image: string;
  description: string;
  brand: string;
  category: { id: string; name: string; slug: string } | null;
  price: number;
  countInStock: number;
  rating: number;
  numReviews: number;
};

export function toPublicProduct(product: ProductListItem): PublicProduct {
  return {
    id: String(product._id),
    name: product.name,
    slug: product.slug,
    image: product.image,
    description: product.description,
    brand: product.brand,
    category: product.category
      ? {
          id: String(product.category._id),
          name: product.category.name,
          slug: product.category.slug,
        }
      : null,
    price: product.price,
    countInStock: product.countInStock,
    rating: product.rating,
    numReviews: product.numReviews,
  };
}

/** Maps a page of products to their public shape, keeping the paging fields. */
export function toPublicPage(
  page: Paginated<ProductListItem>,
): Paginated<PublicProduct> {
  return { ...page, items: page.items.map(toPublicProduct) };
}

/**
 * Clamps paging input, so a hostile `?limit=1000000` cannot exhaust memory.
 *
 * The `Number.isFinite` guard is load-bearing, not defensive noise: `NaN`
 * survives `Math.trunc`, `Math.min` and `Math.max` unchanged, and Mongo treats
 * `.limit(NaN)` as *no limit at all* — so without it the clamp silently inverts
 * into "return the whole collection". A route handler doing
 * `Number(searchParams.get("limit"))` produces exactly that from `?limit=abc`.
 */
function normalisePaging(options: ListProductsOptions) {
  const rawLimit = options.limit;
  const rawPage = options.page;

  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit as number), 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  const page = Number.isFinite(rawPage)
    ? Math.max(Math.trunc(rawPage as number), 1)
    : 1;

  return { page, limit };
}

/**
 * Validates the price range before it reaches Mongo.
 *
 * An unfinite bound raises a raw Mongoose `CastError`, which is not a
 * `ServiceError` and would surface as a 500 with driver internals in it — the
 * class of leak audit B6 was about.
 */
function normalisePriceRange(options: ListProductsOptions) {
  const { minPrice, maxPrice } = options;

  for (const [field, value] of [
    ["minPrice", minPrice],
    ["maxPrice", maxPrice],
  ] as const) {
    if (value === undefined) continue;
    if (!Number.isFinite(value)) {
      throw validationFailed(`${field} must be a number`, { [field]: "number" });
    }
    if (value < 0) {
      throw validationFailed(`${field} cannot be negative`, { [field]: "min" });
    }
  }

  if (
    minPrice !== undefined &&
    maxPrice !== undefined &&
    minPrice > maxPrice
  ) {
    throw validationFailed("minPrice cannot be greater than maxPrice", {
      minPrice: "range",
    });
  }

  return { minPrice, maxPrice };
}

function sortSpec(
  sort: ProductSort | undefined,
  hasSearch: boolean,
): Record<string, SortOrder | { $meta: "textScore" }> {
  switch (sort) {
    case "price-asc":
      return { price: 1 };
    case "price-desc":
      return { price: -1 };
    case "rating":
      return { rating: -1, numReviews: -1 };
    case "relevance":
      // Only meaningful alongside $text; falls back to newest without it.
      // Both branches tie-break on _id for the reason below.
      return hasSearch
        ? { score: { $meta: "textScore" }, _id: -1 }
        : { createdAt: -1, _id: -1 };
    case "newest":
    default:
      // Tie-break on _id so paging is stable when timestamps collide — bulk
      // inserts and seed runs produce identical createdAt values, and without
      // this a product can appear on two pages or none.
      return hasSearch
        ? { score: { $meta: "textScore" }, _id: -1 }
        : { createdAt: -1, _id: -1 };
  }
}

/**
 * Lists products with pagination, search, category filter, price range and sort.
 *
 * The legacy `GET /api/products` did `Product.find({})` and returned everything
 * (audit R5), which does not survive a real catalog.
 */
export async function listProducts(
  options: ListProductsOptions = {},
): Promise<Paginated<ProductListItem>> {
  await connectDB();

  // Validate before anything queries or returns early, so a bad price range is
  // always reported rather than being masked by, say, an unknown category slug.
  const { page, limit } = normalisePaging(options);
  const { minPrice, maxPrice } = normalisePriceRange(options);
  const search = options.search?.trim();
  const filter: QueryFilter<Product> = {};

  if (!options.includeInactive) {
    filter.isActive = true;
  }

  if (search) {
    filter.$text = { $search: search };
  }

  if (options.category) {
    // Resolve slug -> id. An unknown slug must yield an empty page rather than
    // silently ignoring the filter and showing the whole catalog.
    const category = await CategoryModel.findOne({
      slug: options.category.toLowerCase(),
    })
      .select("_id")
      .lean();

    if (!category) {
      return {
        items: [],
        page,
        limit,
        total: 0,
        totalPages: 0,
        hasPrevious: false,
        hasNext: false,
      };
    }
    filter.category = category._id;
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    const price: Record<string, number> = {};
    if (minPrice !== undefined) price.$gte = minPrice;
    if (maxPrice !== undefined) price.$lte = maxPrice;
    filter.price = price;
  }

  const query = ProductModel.find(filter);
  if (search) {
    // textScore is only projectable when a $text filter is present.
    query.select({ score: { $meta: "textScore" } });
  }

  const [items, total] = await Promise.all([
    query
      .sort(sortSpec(options.sort, Boolean(search)))
      .skip((page - 1) * limit)
      .limit(limit)
      .populate<{ category: ProductListItem["category"] }>(
        "category",
        "name slug",
      )
      .lean<ProductListItem[]>(),
    ProductModel.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    items,
    page,
    limit,
    total,
    totalPages,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}

/**
 * Fetches one product by id.
 *
 * Returns null for a malformed id rather than throwing a `CastError`, so a
 * hand-typed URL produces a clean 404. The legacy controller forgot to `await`
 * this query, so a Mongoose Query object — always truthy — was returned and the
 * 404 branch was unreachable (audit B7).
 */
export async function getProductById(
  id: string,
  options: { includeInactive?: boolean } = {},
): Promise<ProductListItem | null> {
  await connectDB();

  if (!Types.ObjectId.isValid(id)) return null;

  const filter: QueryFilter<Product> = { _id: id };
  if (!options.includeInactive) filter.isActive = true;

  return ProductModel.findOne(filter)
    .populate<{ category: ProductListItem["category"] }>("category", "name slug")
    .lean<ProductListItem>();
}

/** As `getProductById`, but throws `not_found` instead of returning null. */
export async function requireProductById(
  id: string,
  options: { includeInactive?: boolean } = {},
): Promise<ProductListItem> {
  const product = await getProductById(id, options);
  if (!product) throw notFound("Product");
  return product;
}

/**
 * Other active products in the same category, best rated first.
 *
 * Takes the product's own id rather than deriving it, so a product page never
 * recommends the product already on screen.
 */
export async function listRelatedProducts(
  categoryId: string,
  excludeProductId: string,
  limit = 4,
): Promise<ProductListItem[]> {
  await connectDB();

  if (!Types.ObjectId.isValid(categoryId)) return [];

  return ProductModel.find({
    category: categoryId,
    isActive: true,
    _id: { $ne: excludeProductId },
  })
    .sort({ rating: -1, _id: -1 })
    .limit(limit)
    .populate<{ category: ProductListItem["category"] }>("category", "name slug")
    .lean<ProductListItem[]>();
}

/** Fetches one product by slug, for SEO-friendly URLs. */
export async function getProductBySlug(
  slug: string,
  options: { includeInactive?: boolean } = {},
): Promise<ProductListItem | null> {
  await connectDB();

  const filter: QueryFilter<Product> = { slug: slug.toLowerCase() };
  if (!options.includeInactive) filter.isActive = true;

  return ProductModel.findOne(filter)
    .populate<{ category: ProductListItem["category"] }>("category", "name slug")
    .lean<ProductListItem>();
}
