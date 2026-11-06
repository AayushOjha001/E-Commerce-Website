import mongoose, { Types } from "mongoose";

import { connectDB } from "@/server/db/connect";
import {
  CartModel,
  OrderModel,
  ProductModel,
  type Address,
  type Order,
  type OrderItem,
  type Product,
} from "@/server/models";
import {
  conflict,
  forbidden,
  notFound,
  outOfStock,
  validationFailed,
} from "./errors";
import { calculateOrderTotals } from "./pricing";

export type CreateOrderInput = {
  shippingAddress: Address;
  paymentMethod: string;
};

export type OrderListItem = Pick<
  Order,
  | "_id"
  | "totalPrice"
  | "status"
  | "isPaid"
  | "paidAt"
  | "isDelivered"
  | "createdAt"
> & { itemCount: number };

/**
 * Creates an order from the user's cart, atomically.
 *
 * Everything the legacy endpoint got wrong happens here correctly:
 *
 * - it crashed outright with `ReferenceError: product is not defined`, so no
 *   order could ever be created (audit B2)
 * - it stored `req.body.orderItems` — prices included — so a client could order
 *   at any price it liked, and never set tax or shipping (audit B3). Line items
 *   and every total are rebuilt here from the database.
 * - it never decremented stock (audit B13). Stock is decremented with a
 *   conditional update, so two shoppers racing for the last unit cannot both
 *   win.
 *
 * The whole thing runs in a transaction, so a failure part-way cannot leave
 * stock decremented without an order, or an order with a cart still full. This
 * is why the dev database runs as a replica set.
 */
export async function createOrderFromCart(
  userId: string,
  input: CreateOrderInput,
): Promise<Order> {
  await connectDB();

  if (!Types.ObjectId.isValid(userId)) throw notFound("User");
  if (!input.paymentMethod?.trim()) {
    throw validationFailed("A payment method is required", {
      paymentMethod: "required",
    });
  }

  const session = await mongoose.startSession();
  try {
    let created: Order | undefined;

    await session.withTransaction(async () => {
      const cart = await CartModel.findOne({ user: userId })
        .populate<{ items: { product: Product | null; qty: number }[] }>(
          "items.product",
        )
        .session(session);

      if (!cart || cart.items.length === 0) {
        throw conflict("Your cart is empty");
      }

      const orderItems: OrderItem[] = [];

      for (const item of cart.items) {
        const product = item.product;
        if (!product) {
          throw conflict(
            "An item in your cart is no longer available. Please review your cart.",
          );
        }

        // Conditional decrement: the filter carries the stock requirement, so
        // the check and the write are one atomic operation. A plain read-then
        // -write would let two concurrent checkouts both pass the check.
        const updated = await ProductModel.findOneAndUpdate(
          {
            _id: product._id,
            isActive: true,
            countInStock: { $gte: item.qty },
          },
          { $inc: { countInStock: -item.qty } },
          { returnDocument: "after", session },
        );

        if (!updated) {
          // Re-read to report what is actually left. Inside the transaction, so
          // it reflects the snapshot this order is working from.
          const current = await ProductModel.findById(product._id)
            .session(session)
            .lean<Product>();

          if (!current?.isActive) {
            throw conflict(`${product.name} is no longer available`);
          }
          throw outOfStock(current.name, current.countInStock);
        }

        // Snapshot name, image and price from the database — never the client.
        // `image` is required by the schema, and the legacy controller omitted
        // it entirely (audit B11).
        orderItems.push({
          name: updated.name,
          qty: item.qty,
          image: updated.image,
          price: updated.price,
          product: updated._id,
        });
      }

      const totals = calculateOrderTotals(orderItems);

      const [order] = await OrderModel.create(
        [
          {
            user: new Types.ObjectId(userId),
            orderItems,
            shippingAddress: input.shippingAddress,
            paymentMethod: input.paymentMethod.trim(),
            ...totals,
            status: "pending",
            isPaid: false,
            isDelivered: false,
          },
        ],
        { session },
      );

      // Emptying the cart is part of the same transaction: an order that exists
      // with the cart still full would let the customer check out twice.
      cart.items = [];
      await cart.save({ session });

      created = order.toObject() as Order;
    });

    if (!created) {
      // Unreachable in practice; withTransaction rethrows on failure.
      throw conflict("Order could not be created");
    }
    return created;
  } finally {
    await session.endSession();
  }
}

/** Lists a user's own orders, newest first. */
export async function listOrdersForUser(
  userId: string,
): Promise<OrderListItem[]> {
  await connectDB();

  if (!Types.ObjectId.isValid(userId)) return [];

  const orders = await OrderModel.find({ user: userId })
    .sort({ createdAt: -1, _id: -1 })
    .lean<Order[]>();

  return orders.map((order) => ({
    _id: order._id,
    totalPrice: order.totalPrice,
    status: order.status,
    isPaid: order.isPaid,
    paidAt: order.paidAt,
    isDelivered: order.isDelivered,
    createdAt: order.createdAt,
    itemCount: order.orderItems.reduce((total, item) => total + item.qty, 0),
  }));
}

/**
 * Fetches one order, enforcing ownership.
 *
 * The legacy `GET /api/orders/:id` fetched by id and returned it with no
 * ownership check at all, so any authenticated user could read anyone's order
 * including their shipping address (audit B4).
 *
 * Throws `forbidden` rather than `not_found` only for a genuine owner mismatch;
 * an id that does not exist is still `not_found`, so this cannot be used to
 * probe which order ids are real.
 */
export async function getOrderForUser(
  orderId: string,
  userId: string,
  options: { isAdmin?: boolean } = {},
): Promise<Order> {
  await connectDB();

  if (!Types.ObjectId.isValid(orderId)) throw notFound("Order");

  const order = await OrderModel.findById(orderId).lean<Order>();
  if (!order) throw notFound("Order");

  if (!options.isAdmin && String(order.user) !== String(userId)) {
    throw forbidden("You do not have access to this order");
  }

  return order;
}
