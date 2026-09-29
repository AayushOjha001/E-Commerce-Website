import { CartModel } from "./cart";
import { CategoryModel } from "./category";
import { OrderModel } from "./order";
import { ProductModel } from "./product";
import { UserModel } from "./user";

export { addressSchema, type Address } from "./address";
export { CartModel, type Cart, type CartDocument, type CartItem } from "./cart";
export {
  CategoryModel,
  slugify,
  type Category,
  type CategoryDocument,
} from "./category";
export {
  fromCents,
  roundMoney,
  sumLineItems,
  toCents,
} from "./money";
export {
  OrderModel,
  ORDER_STATUSES,
  type Order,
  type OrderDocument,
  type OrderItem,
  type OrderStatus,
  type PaymentResult,
} from "./order";
export { ProductModel, type Product, type ProductDocument } from "./product";
export {
  UserModel,
  USER_ROLES,
  type User,
  type UserDocument,
  type UserRole,
} from "./user";

/**
 * Importing this module registers every model.
 *
 * Needed because `populate("category")` fails with `MissingSchemaError` unless
 * the referenced model has been registered, and in a Next.js app a route may
 * only have imported one model directly.
 */
export const models = {
  Cart: CartModel,
  Category: CategoryModel,
  Order: OrderModel,
  Product: ProductModel,
  User: UserModel,
} as const;

/**
 * Builds the indexes declared on the schemas.
 *
 * Mongoose only autocreates indexes in the background on first use, and
 * `unique: true` is an index — not a validation rule — so without this a
 * duplicate email can slip in before the index exists. The seed script and the
 * test setup call it so uniqueness is actually enforced.
 *
 * `syncIndexes` also drops indexes that are no longer declared, which keeps a
 * dev database from accumulating stale ones. That makes it safe for local use
 * and seeding, but it is not something to run blindly against production data.
 */
export async function syncAllIndexes(): Promise<void> {
  await Promise.all(Object.values(models).map((model) => model.syncIndexes()));
}
