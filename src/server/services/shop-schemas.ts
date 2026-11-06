import { z } from "zod";

import { PAYMENT_METHODS } from "@/server/payments/provider";
import { MAX_QTY_PER_ITEM } from "./cart";

/** Request validation for cart and checkout. Limits mirror the Mongoose schemas. */

const required = (label: string, max: number) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

export const shippingAddressSchema = z.object({
  fullName: required("Full name", 120),
  address: required("Address", 250),
  city: required("City", 120),
  postalCode: required("Postal code", 32),
  country: required("Country", 120),
  phone: z
    .string()
    .trim()
    .max(32, "Phone must be 32 characters or fewer")
    .optional()
    .transform((value) => value || undefined),
});

const paymentMethod = z.enum(PAYMENT_METHODS, {
  error: "Choose a payment method",
});

export const checkoutSchema = z.object({
  shippingAddress: shippingAddressSchema,
  paymentMethod,
  expectedTotal: z.number().finite().min(0).optional(),
});

/** Validates an id from a client, which a server action cannot trust either. */
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export const paySchema = z.object({ paymentMethod });

const qty = z
  .number({ error: "Quantity must be a number" })
  .int("Quantity must be a whole number")
  .min(1, "Quantity must be at least 1")
  .max(MAX_QTY_PER_ITEM, `Quantity cannot exceed ${MAX_QTY_PER_ITEM}`);

export const addToCartSchema = z.object({
  productId: z.string({ error: "A product is required" }).min(1),
  qty: qty.default(1),
});

export const setCartQtySchema = z.object({ qty });
