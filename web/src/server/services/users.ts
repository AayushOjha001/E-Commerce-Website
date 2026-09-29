import { Types } from "mongoose";

import { connectDB } from "@/server/db/connect";
import {
  UserModel,
  type User,
  type UserDocument,
  type UserRole,
} from "@/server/models";
import { conflict, notFound, validationFailed } from "./errors";

/**
 * Minimum password length, enforced in the service rather than the schema.
 *
 * It cannot live on the Mongoose path: the pre-save hook replaces the value with
 * a 60-character bcrypt hash, so a `minlength` there would only ever measure the
 * hash and pass unconditionally. T3.2 adds zod validation at the HTTP edge; this
 * is the backstop for server actions and scripts that call the service directly.
 */
export const MIN_PASSWORD_LENGTH = 8;

function assertPasswordStrength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw validationFailed(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      { password: "min" },
    );
  }
}

/**
 * A user as it may safely cross a trust boundary.
 *
 * Never contains `password`. Route handlers and server components return this,
 * not the raw document — the legacy API hand-picked fields at each call site,
 * which is easy to get wrong once.
 */
export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
};

export function toPublicUser(user: User | UserDocument): PublicUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
};

/**
 * Registers a customer. **This is what the public registration endpoint calls.**
 *
 * Separate from `createUser` precisely because it cannot set a role: a handler
 * that spreads a parsed request body into `createUser` would hand the caller
 * `role: "admin"` and self-elevation. The type makes that impossible here rather
 * than relying on the handler to remember to strip the field.
 */
export async function registerCustomer(
  input: Omit<CreateUserInput, "role">,
): Promise<PublicUser> {
  return createUser({ ...input, role: "customer" });
}

/**
 * Creates a user with an explicit role.
 *
 * Privileged: only the seed script and the Batch 6 admin surface should call
 * this. Public registration goes through `registerCustomer`.
 *
 * Checks for a duplicate email first for a friendly message, then relies on the
 * unique index to settle the race if two requests arrive at once — the check
 * alone is not atomic.
 */
export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  await connectDB();

  assertPasswordStrength(input.password);
  const email = input.email.trim().toLowerCase();
  if (await UserModel.exists({ email })) {
    throw conflict("An account with that email already exists");
  }

  try {
    // `create` (not an upsert) so the pre-save hook hashes the password.
    const user = await UserModel.create({
      name: input.name.trim(),
      email,
      password: input.password,
      role: input.role ?? "customer",
    });
    return toPublicUser(user);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw conflict("An account with that email already exists");
    }
    throw error;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

/**
 * Finds a user by email **with the password hash selected**, for login.
 *
 * The only place that opts into `+password`. Callers must not return this
 * document to a client.
 */
// Return type is inferred rather than annotated: `.select("+password")` yields a
// Mongoose 9 `ProjectedHydratedDocument`, which is not the same type as a plain
// `HydratedDocument` even though it still carries the instance methods.
// Annotating it `UserDocument` is a type error; inferring keeps `matchPassword`.
export async function findUserForLogin(email: string) {
  await connectDB();
  return UserModel.findOne({ email: email.trim().toLowerCase() }).select(
    "+password",
  );
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  await connectDB();

  if (!Types.ObjectId.isValid(id)) return null;

  const user = await UserModel.findById(id).lean<User>();
  return user ? toPublicUser(user) : null;
}

export async function requireUserById(id: string): Promise<PublicUser> {
  const user = await getUserById(id);
  if (!user) throw notFound("User");
  return user;
}

export type UpdateProfileInput = {
  name?: string;
  email?: string;
  password?: string;
};

/**
 * Updates a user's own profile.
 *
 * Goes through `save()` so a changed password is hashed by the pre-save hook.
 * `role` is deliberately not updatable here — privilege changes belong to the
 * admin surface in Batch 6, not to a self-service profile edit.
 */
export async function updateUserProfile(
  id: string,
  input: UpdateProfileInput,
): Promise<PublicUser> {
  await connectDB();

  if (!Types.ObjectId.isValid(id)) throw notFound("User");

  const user = await UserModel.findById(id);
  if (!user) throw notFound("User");

  if (input.name !== undefined) user.name = input.name.trim();

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (email !== user.email && (await UserModel.exists({ email }))) {
      throw conflict("An account with that email already exists");
    }
    user.email = email;
  }

  if (input.password !== undefined) {
    assertPasswordStrength(input.password);
    user.password = input.password;
  }

  try {
    await user.save();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw conflict("An account with that email already exists");
    }
    throw error;
  }

  return toPublicUser(user);
}
