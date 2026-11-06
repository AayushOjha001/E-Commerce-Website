import { Types } from "mongoose";
import { z } from "zod";

import { connectDB } from "@/server/db/connect";
import { CategoryModel, ProductModel, type Category, type Product } from "@/server/models";
import { conflict, notFound, validationFailed } from "./errors";

/**
 * Admin catalog writes. Every caller must have passed `requireAdmin()`: these
 * functions take no identity, and the legacy `POST /api/products` shows what
 * happens when nothing checks (audit B5).
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(120, "Slug must be 120 characters or fewer")
  .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens");

const objectId = z
  .string({ error: "Choose a value" })
  .refine((value) => Types.ObjectId.isValid(value), "Choose a value");

/**
 * Images must be a site path or an https URL.
 *
 * This value lands in a `src` attribute and in JSON-LD, so it must never be able
 * to carry a `javascript:` or `data:` URL. `//host/x` is refused too, since it is
 * a remote URL dressed up as a path.
 */
const imageUrl = z
  .string({ error: "Image is required" })
  .trim()
  .min(1, "Image is required")
  .max(500, "Image URL must be 500 characters or fewer")
  .refine(
    (value) =>
      (value.startsWith("/") && !value.startsWith("//")) ||
      value.startsWith("https://"),
    "Use a path like /images/products/name.svg or an https:// URL",
  );

export const productInputSchema = z.object({
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(1, "Name is required")
    .max(200, "Name must be 200 characters or fewer"),
  slug: slug.optional(),
  brand: z
    .string({ error: "Brand is required" })
    .trim()
    .min(1, "Brand is required")
    .max(120, "Brand must be 120 characters or fewer"),
  description: z
    .string({ error: "Description is required" })
    .trim()
    .min(1, "Description is required")
    .max(5000, "Description must be 5000 characters or fewer"),
  image: imageUrl,
  category: objectId,
  price: z
    .number({ error: "Enter a price" })
    .finite("Enter a price")
    .min(0, "Price cannot be negative")
    .max(1_000_000, "Price is too high"),
  countInStock: z
    .number({ error: "Enter a stock count" })
    .int("Stock must be a whole number")
    .min(0, "Stock cannot be negative")
    .max(1_000_000, "Stock is too high"),
});

export type ProductInput = z.infer<typeof productInputSchema>;

export const productPatchSchema = productInputSchema.partial();
export type ProductPatch = z.infer<typeof productPatchSchema>;

export const categoryInputSchema = z.object({
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(1, "Name is required")
    .max(80, "Name must be 80 characters or fewer"),
  slug: slug.optional(),
  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or fewer")
    .optional(),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const categoryPatchSchema = categoryInputSchema.partial();

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

async function assertCategoryExists(id: string): Promise<void> {
  if (!(await CategoryModel.exists({ _id: id }))) {
    throw validationFailed("That department no longer exists", {
      category: "Choose a department",
    });
  }
}

async function saveProduct(write: () => Promise<Product>): Promise<Product> {
  try {
    return await write();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw conflict("Another product already uses that slug");
    }
    throw error;
  }
}

export async function createProduct(input: ProductInput): Promise<Product> {
  await connectDB();
  await assertCategoryExists(input.category);

  return saveProduct(async () => {
    const product = await ProductModel.create(input);
    return product.toObject() as Product;
  });
}

export async function updateProduct(
  id: string,
  patch: ProductPatch,
): Promise<Product> {
  await connectDB();

  if (!Types.ObjectId.isValid(id)) throw notFound("Product");
  if (patch.category) await assertCategoryExists(patch.category);

  const product = await ProductModel.findById(id);
  if (!product) throw notFound("Product");

  product.set(patch);

  return saveProduct(async () => {
    await product.save();
    return product.toObject() as Product;
  });
}

/**
 * Withdraws a product from sale, or returns it.
 *
 * A soft delete, because past orders still link to the product, and the cart
 * reports a withdrawn line as unavailable rather than failing at checkout.
 */
export async function setProductActive(
  id: string,
  isActive: boolean,
): Promise<Product> {
  await connectDB();

  if (!Types.ObjectId.isValid(id)) throw notFound("Product");

  const product = await ProductModel.findByIdAndUpdate(
    id,
    { $set: { isActive } },
    { returnDocument: "after" },
  ).lean<Product>();

  if (!product) throw notFound("Product");
  return product;
}

async function saveCategory(write: () => Promise<Category>): Promise<Category> {
  try {
    return await write();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw conflict("Another department already uses that name or slug");
    }
    throw error;
  }
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  await connectDB();

  return saveCategory(async () => {
    const category = await CategoryModel.create(input);
    return category.toObject() as Category;
  });
}

export async function updateCategory(
  id: string,
  patch: Partial<CategoryInput>,
): Promise<Category> {
  await connectDB();

  if (!Types.ObjectId.isValid(id)) throw notFound("Category");

  const category = await CategoryModel.findById(id);
  if (!category) throw notFound("Category");

  category.set(patch);

  return saveCategory(async () => {
    await category.save();
    return category.toObject() as Category;
  });
}

/**
 * Deletes an empty category.
 *
 * Withdrawn products count too: they still reference the category, and returning
 * one to sale later would otherwise leave it pointing at nothing.
 */
export async function deleteCategory(id: string): Promise<void> {
  await connectDB();

  if (!Types.ObjectId.isValid(id)) throw notFound("Category");

  const inUse = await ProductModel.countDocuments({ category: id });
  if (inUse > 0) {
    throw conflict(
      `This department still has ${inUse} product${inUse === 1 ? "" : "s"}. Move them first.`,
    );
  }

  const deleted = await CategoryModel.findByIdAndDelete(id);
  if (!deleted) throw notFound("Category");
}
