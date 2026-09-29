import { Types } from "mongoose";

import { connectDB } from "@/server/db/connect";
import {
  CartModel,
  ProductModel,
  sumLineItems,
  type Product,
} from "@/server/models";
import { notFound, outOfStock, validationFailed } from "./errors";

/** Upper bound per line, so one request cannot reserve the whole catalog. */
export const MAX_QTY_PER_ITEM = 99;

export type CartLine = {
  productId: string;
  name: string;
  slug: string;
  image: string;
  price: number;
  qty: number;
  /** `price * qty`, rounded. */
  lineTotal: number;
  countInStock: number;
  /** True when stock has fallen below the quantity already in the cart. */
  exceedsStock: boolean;
};

export type CartView = {
  items: CartLine[];
  /** Sum of line totals. Tax and shipping are added at checkout, not here. */
  subtotal: number;
  itemCount: number;
  /** True if any line is now unfulfillable, so checkout can be blocked. */
  hasIssues: boolean;
};

const EMPTY_CART: CartView = {
  items: [],
  subtotal: 0,
  itemCount: 0,
  hasIssues: false,
};

function assertValidQty(qty: number): void {
  if (!Number.isInteger(qty)) {
    throw validationFailed("Quantity must be a whole number", { qty: "integer" });
  }
  if (qty < 1) {
    throw validationFailed("Quantity must be at least 1", { qty: "min" });
  }
  if (qty > MAX_QTY_PER_ITEM) {
    throw validationFailed(`Quantity cannot exceed ${MAX_QTY_PER_ITEM}`, {
      qty: "max",
    });
  }
}

/** Loads an active product, or throws. Inactive products cannot be added. */
async function requirePurchasableProduct(productId: string) {
  if (!Types.ObjectId.isValid(productId)) throw notFound("Product");

  const product = await ProductModel.findOne({
    _id: productId,
    isActive: true,
  }).lean<Product>();

  if (!product) throw notFound("Product");
  return product;
}

/**
 * Builds the view model for a user's cart.
 *
 * Prices and stock are read live from products rather than copied into the cart,
 * so a cart cannot quietly hold a stale price. Snapshotting happens at checkout,
 * where it belongs.
 */
export async function getCart(userId: string): Promise<CartView> {
  await connectDB();

  if (!Types.ObjectId.isValid(userId)) return EMPTY_CART;

  const cart = await CartModel.findOne({ user: userId }).populate<{
    items: { product: Product | null; qty: number }[];
  }>("items.product");

  if (!cart || cart.items.length === 0) return EMPTY_CART;

  const items: CartLine[] = [];
  for (const item of cart.items) {
    // A product deleted outright leaves a dangling ref; skip rather than crash.
    if (!item.product) continue;

    const product = item.product;
    items.push({
      productId: String(product._id),
      name: product.name,
      slug: product.slug,
      image: product.image,
      price: product.price,
      qty: item.qty,
      lineTotal: sumLineItems([{ price: product.price, qty: item.qty }]),
      countInStock: product.countInStock,
      exceedsStock: item.qty > product.countInStock,
    });
  }

  return {
    items,
    subtotal: sumLineItems(items),
    itemCount: items.reduce((total, item) => total + item.qty, 0),
    hasIssues: items.some((item) => item.exceedsStock),
  };
}

/**
 * Adds to the cart, **incrementing** an existing line.
 *
 * The legacy endpoint overwrote the quantity instead (`items[i].qty = qty`), so
 * adding the same product twice silently discarded the first add (audit R9).
 */
export async function addToCart(
  userId: string,
  productId: string,
  qty = 1,
): Promise<CartView> {
  await connectDB();
  assertValidQty(qty);

  const product = await requirePurchasableProduct(productId);

  const cart =
    (await CartModel.findOne({ user: userId })) ??
    new CartModel({ user: userId, items: [] });

  const existing = cart.items.find(
    (item) => String(item.product) === String(product._id),
  );
  const nextQty = (existing?.qty ?? 0) + qty;

  if (nextQty > MAX_QTY_PER_ITEM) {
    throw validationFailed(
      `You cannot have more than ${MAX_QTY_PER_ITEM} of one item in the cart`,
      { qty: "max" },
    );
  }
  // Checked against live stock here for a fast, friendly failure; checkout
  // re-checks atomically, because stock can change between the two.
  if (nextQty > product.countInStock) {
    throw outOfStock(product.name, product.countInStock);
  }

  if (existing) {
    existing.qty = nextQty;
  } else {
    cart.items.push({ product: product._id, qty: nextQty });
  }

  await cart.save();
  return getCart(userId);
}

/** Sets an exact quantity, for the cart page's quantity selector. */
export async function setCartItemQty(
  userId: string,
  productId: string,
  qty: number,
): Promise<CartView> {
  await connectDB();
  assertValidQty(qty);

  const product = await requirePurchasableProduct(productId);

  const cart = await CartModel.findOne({ user: userId });
  if (!cart) throw notFound("Cart");

  const existing = cart.items.find(
    (item) => String(item.product) === String(product._id),
  );
  if (!existing) throw notFound("Cart item");

  if (qty > product.countInStock) {
    throw outOfStock(product.name, product.countInStock);
  }

  existing.qty = qty;
  await cart.save();
  return getCart(userId);
}

/** Removes a line. Idempotent: removing an absent item is not an error. */
export async function removeFromCart(
  userId: string,
  productId: string,
): Promise<CartView> {
  await connectDB();

  if (!Types.ObjectId.isValid(productId)) throw notFound("Product");

  const cart = await CartModel.findOne({ user: userId });
  if (!cart) return EMPTY_CART;

  cart.items = cart.items.filter(
    (item) => String(item.product) !== String(productId),
  );
  await cart.save();

  return getCart(userId);
}

export async function clearCart(userId: string): Promise<CartView> {
  await connectDB();

  await CartModel.findOneAndUpdate(
    { user: userId },
    { $set: { items: [] } },
  );

  return EMPTY_CART;
}
