import { connectDB } from "@/server/db/connect";
import { CategoryModel, ProductModel, type Category } from "@/server/models";
import { notFound } from "./errors";

export type CategoryWithCount = Category & { productCount: number };

/** Lists categories alphabetically. */
export async function listCategories(): Promise<Category[]> {
  await connectDB();
  return CategoryModel.find().sort({ name: 1 }).lean<Category[]>();
}

/**
 * Lists categories with a count of active products in each.
 *
 * Counted with one aggregation rather than a query per category, so adding
 * categories does not add round trips.
 */
export async function listCategoriesWithCounts(): Promise<CategoryWithCount[]> {
  await connectDB();

  const [categories, counts] = await Promise.all([
    CategoryModel.find().sort({ name: 1 }).lean<Category[]>(),
    ProductModel.aggregate<{ _id: unknown; count: number }>([
      { $match: { isActive: true } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]),
  ]);

  const countByCategoryId = new Map(
    counts.map((row) => [String(row._id), row.count]),
  );

  return categories.map((category) => ({
    ...category,
    productCount: countByCategoryId.get(String(category._id)) ?? 0,
  }));
}

export async function getCategoryBySlug(
  slug: string,
): Promise<Category | null> {
  await connectDB();
  return CategoryModel.findOne({ slug: slug.toLowerCase() }).lean<Category>();
}

export async function requireCategoryBySlug(slug: string): Promise<Category> {
  const category = await getCategoryBySlug(slug);
  if (!category) throw notFound("Category");
  return category;
}
