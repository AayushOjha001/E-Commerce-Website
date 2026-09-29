import { Schema, type HydratedDocument, type Types } from "mongoose";

import { defineModel } from "./registry";

export type CartItem = {
  product: Types.ObjectId;
  qty: number;
};

export type Cart = {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  items: CartItem[];
  createdAt: Date;
  updatedAt: Date;
};

export type CartDocument = HydratedDocument<Cart>;

const cartItemSchema = new Schema<CartItem>(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required"],
    },
    qty: {
      type: Number,
      required: true,
      default: 1,
      min: [1, "Quantity must be at least 1"],
      validate: {
        validator: Number.isInteger,
        message: "Quantity must be a whole number",
      },
    },
  },
  // No per-item _id: items are identified by their product.
  { _id: false },
);

const cartSchema = new Schema<Cart>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      unique: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  // The legacy schema wrote `{ timestamp: true }` (singular), which Mongoose
  // silently ignores, so carts had no createdAt/updatedAt at all (audit B10).
  { timestamps: true },
);

export const CartModel = defineModel<Cart>("Cart", cartSchema);
