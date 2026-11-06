import { z } from "zod";

import { MIN_PASSWORD_LENGTH } from "@/server/services/users";

/**
 * Request validation for the auth endpoints.
 *
 * The legacy endpoints validated nothing: `registerUser` passed `req.body`
 * straight to `User.create`, so a missing field surfaced as a Mongoose error and
 * an unexpected one was silently ignored.
 */

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name must be 120 characters or fewer"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(254, "Email is too long")
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    // bcrypt only hashes the first 72 bytes; silently ignoring the rest would
    // make a longer password weaker than the user believes.
    .max(72, "Password must be 72 characters or fewer"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required"),
  // No length rules on login: they would leak the password policy and add
  // nothing, since the credential either matches or it does not.
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120).optional(),
    email: z.string().trim().email("Enter a valid email address").optional(),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      .max(72, "Password must be 72 characters or fewer")
      .optional(),
  })
  // `role` is deliberately absent: an unknown key is stripped by default, so a
  // client sending `role: "admin"` cannot elevate itself through this endpoint.
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one field to update",
  );

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
