import { Schema, type HydratedDocument, type Types } from "mongoose";

import { addressSchema, type Address } from "./address";
import { moneySetter } from "./money";
import { defineModel } from "./registry";

export const ORDER_STATUSES = [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * A line item is a deliberate *snapshot*, not a live join.
 *
 * `name`, `image` and `price` are copied at purchase time so a later price
 * change or rename does not rewrite what the customer actually bought. The
 * `product` ref is kept for linking back.
 */
export type OrderItem = {
  name: string;
  qty: number;
  image: string;
  price: number;
  product: Types.ObjectId;
};

export type PaymentResult = {
  id?: string;
  status?: string;
  updateTime?: string;
  emailAddress?: string;
  /** Which provider settled this — "mock" in dev (PLAN D8). */
  provider?: string;
};

export type Order = {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  orderItems: OrderItem[];
  shippingAddress: Address;
  paymentMethod: string;
  paymentResult?: PaymentResult;
  itemsPrice: number;
  taxPrice: number;
  shippingPrice: number;
  totalPrice: number;
  status: OrderStatus;
  isPaid: boolean;
  paidAt?: Date;
  isDelivered: boolean;
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type OrderDocument = HydratedDocument<Order>;

const orderItemSchema = new Schema<OrderItem>(
  {
    name: { type: String, required: [true, "Item name is required"], trim: true },
    qty: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
      validate: {
        validator: Number.isInteger,
        message: "Quantity must be a whole number",
      },
    },
    // Required, as in the legacy schema — but the legacy order controller built
    // its line items without ever setting it, so a server-built order could not
    // validate (audit B11). Kept required because it is a display snapshot; the
    // order service is responsible for copying it from the product, and
    // order.test.ts pins that contract.
    image: { type: String, required: [true, "Item image is required"], trim: true },
    price: {
      type: Number,
      required: true,
      min: [0, "Price cannot be negative"],
      set: moneySetter,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product reference is required"],
    },
  },
  { _id: false },
);

const orderSchema = new Schema<Order>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },
    orderItems: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items: OrderItem[]) => items.length > 0,
        message: "An order needs at least one item",
      },
    },
    shippingAddress: {
      type: addressSchema,
      required: [true, "Shipping address is required"],
    },
    paymentMethod: {
      type: String,
      required: [true, "Payment method is required"],
      trim: true,
    },
    paymentResult: {
      type: new Schema<PaymentResult>(
        {
          id: String,
          status: String,
          updateTime: String,
          emailAddress: String,
          provider: String,
        },
        { _id: false },
      ),
    },
    // All four are server-computed from database prices, never taken from the
    // request body — the legacy controller trusted client-supplied prices and
    // left tax/shipping silently at 0 (audit B3).
    itemsPrice: { type: Number, required: true, default: 0, min: 0, set: moneySetter },
    taxPrice: { type: Number, required: true, default: 0, min: 0, set: moneySetter },
    shippingPrice: { type: Number, required: true, default: 0, min: 0, set: moneySetter },
    totalPrice: { type: Number, required: true, default: 0, min: 0, set: moneySetter },
    status: {
      type: String,
      enum: { values: ORDER_STATUSES, message: "Unknown order status" },
      default: "pending",
      required: true,
      index: true,
    },
    isPaid: { type: Boolean, required: true, default: false },
    paidAt: Date,
    isDelivered: { type: Boolean, required: true, default: false },
    deliveredAt: Date,
  },
  { timestamps: true },
);

export const OrderModel = defineModel<Order>("Order", orderSchema);
