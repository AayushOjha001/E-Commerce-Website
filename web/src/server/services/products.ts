import type { QueryFilter, SortOrder } from "mongoose";
import { Types } from "mongoose";

import { connectDB } from "@/server/db/connect";
import { CategoryModel, ProductModel, type Product } from "@/server/models";
import { notFound } from "./errors";

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

/** Clamps paging input, so a hostile `?limit=1000000` cannot exhaust memory. */
function normalisePaging(options: ListProductsOptions) {
  const limit = Math.min(
    Math.max(Math.trunc(options.limit ?? DEFAULT_PAGE_SIZE), 1),
    MAX_PAGE_SIZE,
  );
  const page = Math.max(Math.trunc(options.page ?? 1), 1);
  return { page, limit };
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

  const { page, limit } = normalisePaging(options);
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

  if (options.minPrice !== undefined || options.maxPrice !== undefined) {
    const price: Record<string, number> = {};
    if (options.minPrice !== undefined) price.$gte = options.minPrice;
    if (options.maxPrice !== undefined) price.$lte = options.maxPrice;
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
