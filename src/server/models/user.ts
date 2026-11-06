import bcrypt from "bcryptjs";
import { Schema, type HydratedDocument, type Model, type Types } from "mongoose";

import { defineModel } from "./registry";

export const USER_ROLES = ["customer", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const BCRYPT_ROUNDS = 10;

export type User = {
  _id: Types.ObjectId;
  name: string;
  email: string;
  /**
   * bcrypt hash. `select: false`, so it is absent unless a query opts in with
   * `.select("+password")` — that way a stray `findOne()` cannot leak hashes
   * into an API response.
   */
  password: string;
  role: UserRole;
  /**
   * Bumped whenever the password changes, to invalidate existing sessions.
   *
   * Sessions are stateless JWTs, so a password change would otherwise leave
   * every token issued before it valid for its full remaining lifetime — a
   * token stolen beforehand would survive the very action taken to stop it.
   * A token carries the version it was minted with and is rejected once it
   * no longer matches.
   *
   * A counter rather than a `passwordChangedAt` timestamp: a JWT's `iat` has
   * whole-second resolution, so a timestamp cannot tell a token issued just
   * before a change from one issued just after, within the same second.
   */
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

export type UserMethods = {
  matchPassword(candidate: string): Promise<boolean>;
};

export type UserDocument = HydratedDocument<User, UserMethods>;

/**
 * Model type carrying the instance methods, so `matchPassword` survives.
 *
 * The `{}` is Mongoose's own default for `TQueryHelpers`. Substituting `object`
 * is not assignment-compatible with it and breaks `Model`'s method signatures
 * (`bulkSave` first), so the lint rule is suppressed rather than the type
 * changed.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type UserModelType = Model<User, {}, UserMethods>;

const userSchema = new Schema<User, UserModelType, UserMethods>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [120, "Name must be 120 characters or fewer"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      // Normalise so "A@B.com " and "a@b.com" cannot become two accounts.
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email is not valid"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      select: false,
    },
    tokenVersion: {
      type: Number,
      required: true,
      default: 0,
      select: false,
    },
    // The legacy schema used `isAdmin: Boolean`. An enum leaves room for more
    // roles without another migration, and reads better at call sites than a
    // bare boolean. Legacy `isAdmin: true` maps to `role: "admin"`.
    role: {
      type: String,
      enum: { values: USER_ROLES, message: "Role must be customer or admin" },
      default: "customer",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

/**
 * Hashes the password whenever it changes.
 *
 * The `return` matters: the legacy hook called `next()` without returning and
 * then fell through to hash again, so any later `user.save()` double-hashed an
 * already-hashed password and silently locked the user out (audit B9).
 */
// Promise style, taking no `next`: Mongoose 9 does not pass `next` to an async
// middleware function, so calling it throws "next is not a function". Mongoose 8
// accepted both styles. Returning early is the equivalent of `return next()`.
userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) {
    return;
  }

  this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);

  // Only on a *change*, not on creation: a brand-new account has no older
  // sessions to invalidate, and starting everyone at version 0 keeps it simple.
  if (!this.isNew) {
    this.tokenVersion = (this.tokenVersion ?? 0) + 1;
  }
});

userSchema.methods.matchPassword = async function matchPassword(
  candidate: string,
): Promise<boolean> {
  // `password` is select:false, so a document fetched without "+password" has
  // none. Comparing against undefined would throw inside bcrypt; fail closed.
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

export const UserModel = defineModel<User, UserModelType>("User", userSchema);
