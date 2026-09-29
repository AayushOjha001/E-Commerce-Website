import { Types } from "mongoose";

import { connectDB } from "@/server/db/connect";
import {
  UserModel,
  type User,
  type UserDocument,
  type UserRole,
} from "@/server/models";
import { conflict, notFound } from "./errors";

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
 * Creates a user, rejecting a duplicate email.
 *
 * Checks first for a friendly message, then relies on the unique index to settle
 * the race if two requests arrive at once — the check alone is not atomic.
 */
export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  await connectDB();

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

  if (input.password !== undefined) user.password = input.password;

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
