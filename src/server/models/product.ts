import { Schema, type HydratedDocument, type Types } from "mongoose";

import { moneySetter } from "./money";
import { defineModel } from "./registry";
import { slugify } from "./category";

export type Product = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  image: string;
  description: string;
  brand: string;
  /** Reference to a Category. The legacy schema stored a bare string. */
  category: Types.ObjectId;
  price: number;
  countInStock: number;
  rating: number;
  numReviews: number;
  /** Soft-delete flag, so removing a product cannot orphan historical orders. */
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductDocument = HydratedDocument<Product>;

const productSchema = new Schema<Product>(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: [200, "Name must be 200 characters or fewer"],
    },
    slug: {
      type: String,
      required: [true, "Product slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    image: {
      type: String,
      required: [true, "Image is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [5000, "Description must be 5000 characters or fewer"],
    },
    brand: {
      type: String,
      required: [true, "Brand is required"],
      trim: true,
      maxlength: [120, "Brand must be 120 characters or fewer"],
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
      index: true,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
      set: moneySetter,
    },
    // Legacy schema typed this `String` (audit B8), so posting 5 stored "5" and
    // stock comparisons became string comparisons — "10" < "9" is true.
    countInStock: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Stock cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Stock must be a whole number",
      },
    },
    rating: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Rating cannot be below 0"],
      max: [5, "Rating cannot be above 5"],
    },
    numReviews: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Review count cannot be negative"],
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

productSchema.pre("validate", function deriveSlug() {
  if (!this.slug && this.name) {
    this.slug = slugify(this.name);
  }
});

// Full-text search across the fields a shopper would type (T4.1). Weighted so a
// name match outranks a brand match, and a description match ranks lowest.
// MongoDB allows only one text index per collection, hence one compound one.
productSchema.index(
  { name: "text", brand: "text", description: "text" },
  { weights: { name: 10, brand: 5, description: 1 }, name: "product_text" },
);

// Covers the default catalog query: active products in a category, newest first.
productSchema.index({ isActive: 1, category: 1, createdAt: -1 });

// Covers sorting the catalog by price.
productSchema.index({ isActive: 1, price: 1 });

export const ProductModel = defineModel<Product>("Product", productSchema);
