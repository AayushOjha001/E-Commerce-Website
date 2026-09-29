import { Schema } from "mongoose";

/**
 * A shipping address.
 *
 * Defined as a reusable subdocument schema rather than its own collection: an
 * order needs an immutable *snapshot* of where it shipped, so that editing a
 * saved address later cannot rewrite the history of past orders.
 */
export type Address = {
  fullName: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  phone?: string;
};

export const addressSchema = new Schema<Address>(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      maxlength: [120, "Full name must be 120 characters or fewer"],
    },
    address: {
      type: String,
      required: [true, "Address is required"],
      trim: true,
      maxlength: [250, "Address must be 250 characters or fewer"],
    },
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
      maxlength: [120, "City must be 120 characters or fewer"],
    },
    postalCode: {
      type: String,
      required: [true, "Postal code is required"],
      trim: true,
      maxlength: [32, "Postal code must be 32 characters or fewer"],
    },
    country: {
      type: String,
      required: [true, "Country is required"],
      trim: true,
      maxlength: [120, "Country must be 120 characters or fewer"],
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [32, "Phone must be 32 characters or fewer"],
    },
  },
  { _id: false },
);
