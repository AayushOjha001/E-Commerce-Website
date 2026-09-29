import {
  CartModel,
  CategoryModel,
  OrderModel,
  ProductModel,
  UserModel,
  syncAllIndexes,
} from "@/server/models";
import { connectDB } from "@/server/db/connect";
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

/**
 * Refuses to run against a production database.
 *
 * Seeding creates accounts with a known, published password, so running it
 * anywhere real would hand out valid logins. `ALLOW_PRODUCTION_SEED=1` is the
 * deliberate escape hatch.
 */
function assertNotProduction(): void {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PRODUCTION_SEED !== "1"
  ) {
    throw new Error(
      "Refusing to seed with NODE_ENV=production: this creates accounts with a " +
        "known password. Set ALLOW_PRODUCTION_SEED=1 only if you are certain.",
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
  assertNotProduction();

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

  for (const user of users) {
    // Not an upsert: the password must go through the document's pre-save hook
    // to be hashed. findOneAndUpdate bypasses it and would store plaintext.
    const existing = await UserModel.findOne({ email: user.email });

    if (existing) {
      existing.name = user.name;
      existing.role = user.role;
      existing.password = password;
      await existing.save();
    } else {
      await UserModel.create({ ...user, password });
    }
  }
  log(`Seeded ${users.length} users (password: ${password}).`);

  return {
    categories: SEED_CATEGORIES.length,
    products: SEED_PRODUCTS.length,
    users: users.length,
  };
}

export { DEFAULT_SEED_PASSWORD };
