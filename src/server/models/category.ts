import { Schema, type HydratedDocument, type Types } from "mongoose";

import { defineModel } from "./registry";

export type Category = {
  _id: Types.ObjectId;
  name: string;
  /** URL-safe identifier, used for `/products?category=audio`. */
  slug: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CategoryDocument = HydratedDocument<Category>;

/** Lowercases, strips accents and non-alphanumerics, collapses to hyphens. */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const categorySchema = new Schema<Category>(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      unique: true,
      maxlength: [80, "Category name must be 80 characters or fewer"],
    },
    slug: {
      type: String,
      required: [true, "Category slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description must be 500 characters or fewer"],
    },
  },
  { timestamps: true },
);

// Derive the slug from the name when it was not set explicitly, so callers
// cannot create a category with a mismatched or missing slug.
categorySchema.pre("validate", function deriveSlug() {
  if (!this.slug && this.name) {
    this.slug = slugify(this.name);
  }
});

export const CategoryModel = defineModel<Category>("Category", categorySchema);
