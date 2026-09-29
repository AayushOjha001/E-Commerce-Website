import {
  CartModel,
  CategoryModel,
  OrderModel,
  ProductModel,
  UserModel,
  syncAllIndexes,
} from "@/server/models";
import { connectDB } from "@/server/db/connect";
import { env } from "@/lib/env";
import {
  SEED_CATEGORIES,
  SEED_PRODUCTS,
  seedImagePath,
} from "@/server/db/seed-data";

/**
 * Development password for the seeded accounts.
 *
 * Not a secret: it is documented in the README and only ever reaches a local
 * database. Override with SEED_PASSWORD if you want something else. The
 * production guard below is what keeps this from mattering anywhere real.
 */
const DEFAULT_SEED_PASSWORD = "Password123!";

export type SeedResult = {
  categories: number;
  products: number;
  users: number;
};

export type SeedOptions = {
  /** Also wipe carts and orders. Off by default so reseeding is non-destructive. */
  reset?: boolean;
  /** Suppresses logging, for tests. */
  quiet?: boolean;
};

/** Hosts a dev database is allowed to live on. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "mongo"]);

/**
 * Refuses to seed anything that is not plainly a local database.
 *
 * Checks the **target host**, not `NODE_ENV`. Keying on NODE_ENV was close to
 * useless here: `tsx` does not set it, so for the documented invocation
 * (`npm run seed`) it is `undefined` and the guard never fired. Meanwhile the
 * realistic accident is not a stray NODE_ENV but a `.env.local` or shell
 * `MONGODB_URI` pointing at a shared or remote cluster — which would seed
 * `admin@example.com` with a published password **and the admin role** into it.
 *
 * `ALLOW_REMOTE_SEED=1` is the deliberate escape hatch.
 */
function assertLocalTarget(uri: string): void {
  if (process.env.ALLOW_REMOTE_SEED === "1") return;

  let host: string;
  try {
    host = new URL(uri).hostname;
  } catch {
    throw new Error(`Refusing to seed: MONGODB_URI is not a parseable URI`);
  }

  // `mongodb+srv://` always denotes a hosted cluster.
  const isSrv = uri.startsWith("mongodb+srv://");

  if (isSrv || !LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to seed a non-local database (host: ${host || "unknown"}). ` +
        "Seeding creates accounts with a published password and an admin role. " +
        "Set ALLOW_REMOTE_SEED=1 only if you are certain this is a throwaway database.",
    );
  }
}

/**
 * Seeds categories, products and two demo users.
 *
 * Idempotent: every write is an upsert keyed on a natural identifier (category
 * slug, product slug, user email), so running it repeatedly converges on the
 * same data instead of duplicating it.
 */
export async function seed(options: SeedOptions = {}): Promise<SeedResult> {
  assertLocalTarget(env().MONGODB_URI);

  const log = options.quiet ? () => {} : console.log;

  await connectDB();
  // Build indexes first: the unique constraints below are indexes, not
  // validation rules, so upserting without them can race in duplicates.
  await syncAllIndexes();

  if (options.reset) {
    await Promise.all([CartModel.deleteMany({}), OrderModel.deleteMany({})]);
    log("Cleared carts and orders.");
  }

  // Categories, then map slug -> _id for the products to reference.
  const categoryIds = new Map<string, import("mongoose").Types.ObjectId>();
  for (const category of SEED_CATEGORIES) {
    const doc = await CategoryModel.findOneAndUpdate(
      { slug: category.slug },
      { $set: category },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
    categoryIds.set(category.slug, doc._id);
  }
  log(`Seeded ${SEED_CATEGORIES.length} categories.`);

  for (const product of SEED_PRODUCTS) {
    const categoryId = categoryIds.get(product.categorySlug);
    if (!categoryId) {
      throw new Error(
        `Product "${product.slug}" references unknown category "${product.categorySlug}"`,
      );
    }

    await ProductModel.findOneAndUpdate(
      { slug: product.slug },
      {
        // Listed explicitly rather than spreading the seed record, so
        // `categorySlug` (a seed-only field) cannot leak into the document.
        $set: {
          name: product.name,
          slug: product.slug,
          brand: product.brand,
          description: product.description,
          price: product.price,
          countInStock: product.countInStock,
          rating: product.rating,
          numReviews: product.numReviews,
          category: categoryId,
          image: seedImagePath(product.slug),
          isActive: true,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
  }
  log(`Seeded ${SEED_PRODUCTS.length} products.`);

  const password = process.env.SEED_PASSWORD ?? DEFAULT_SEED_PASSWORD;
  const users = [
    { name: "Admin User", email: "admin@example.com", role: "admin" as const },
    {
      name: "Demo Customer",
      email: "customer@example.com",
      role: "customer" as const,
    },
  ];

  let passwordsReset = 0;
  for (const user of users) {
    // Not an upsert: the password must go through the document's pre-save hook
    // to be hashed. findOneAndUpdate bypasses it and would store plaintext.
    const existing = await UserModel.findOne({ email: user.email });

    if (existing) {
      existing.name = user.name;
      existing.role = user.role;
      // The password is deliberately NOT reset on every run: that would discard
      // a password the developer changed locally, and re-hashing with a fresh
      // salt each time means the stored state never actually settles, which is
      // at odds with this script being idempotent. Opt in with
      // SEED_RESET_PASSWORDS=1.
      if (process.env.SEED_RESET_PASSWORDS === "1") {
        existing.password = password;
        passwordsReset += 1;
      }
      await existing.save();
    } else {
      await UserModel.create({ ...user, password });
      passwordsReset += 1;
    }
  }

  // Only ever names the built-in default. An operator-supplied SEED_PASSWORD is
  // not echoed, since this output lands in terminal scrollback and CI logs.
  const shown =
    password === DEFAULT_SEED_PASSWORD ? password : "(from SEED_PASSWORD)";
  log(
    `Seeded ${users.length} users.` +
      (passwordsReset > 0
        ? ` Set the password on ${passwordsReset} of them: ${shown}.`
        : " Existing passwords left unchanged (SEED_RESET_PASSWORDS=1 to reset)."),
  );

  return {
    categories: SEED_CATEGORIES.length,
    products: SEED_PRODUCTS.length,
    users: users.length,
  };
}

export { DEFAULT_SEED_PASSWORD };
