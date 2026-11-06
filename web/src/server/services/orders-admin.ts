import mongoose, { Types, type QueryFilter } from "mongoose";

import { connectDB } from "@/server/db/connect";
import {
  ORDER_STATUSES,
  OrderModel,
  ProductModel,
  type Order,
  type OrderStatus,
  type User,
} from "@/server/models";
import { conflict, isServiceError, notFound } from "./errors";
import type { Paginated } from "./products";
import { getOrderForUser, isPaymentInProgress, orderNumber } from "./orders";

/**
 * Where an order may go from each status.
 *
 * `paid` is reachable by hand for a payment taken outside the shop. Nothing
 * leaves `delivered` or `cancelled`: reversing either would have to re-decide
 * stock and money, which is a new order's job.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

/** How long an unpaid order may hold stock before it is released. */
export const UNPAID_ORDER_TTL_MINUTES = 30;

export const LOW_STOCK_LEVEL = 5;
const ORDERS_PER_PAGE = 20;

export type AdminOrderRow = {
  id: string;
  number: string;
  customerName: string;
  customerEmail: string;
  itemCount: number;
  totalPrice: number;
  status: OrderStatus;
  createdAt: string;
};

export async function listAllOrders(
  options: { page?: number; status?: OrderStatus } = {},
): Promise<Paginated<AdminOrderRow>> {
  await connectDB();

  const page = Math.max(Math.trunc(options.page ?? 1) || 1, 1);
  const filter: QueryFilter<Order> = {};
  if (options.status) filter.status = options.status;

  const [orders, total] = await Promise.all([
    OrderModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * ORDERS_PER_PAGE)
      .limit(ORDERS_PER_PAGE)
      .populate<{ user: Pick<User, "name" | "email"> | null }>("user", "name email")
      .lean(),
    OrderModel.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / ORDERS_PER_PAGE);

  return {
    items: orders.map((order) => ({
      id: String(order._id),
      number: orderNumber(order._id),
      // An account can be deleted while its orders must remain.
      customerName: order.user?.name ?? "Deleted account",
      customerEmail: order.user?.email ?? "",
      itemCount: order.orderItems.reduce((sum, item) => sum + item.qty, 0),
      totalPrice: order.totalPrice,
      status: order.status,
      createdAt: new Date(order.createdAt).toISOString(),
    })),
    page,
    limit: ORDERS_PER_PAGE,
    total,
    totalPages,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}

function statusUpdate(order: Order, next: OrderStatus) {
  const now = new Date();

  switch (next) {
    case "paid":
      return {
        status: next,
        isPaid: true,
        paidAt: now,
        paymentResult: {
          status: "succeeded",
          provider: "manual",
          updateTime: now.toISOString(),
        },
      };
    case "delivered":
      return { status: next, isDelivered: true, deliveredAt: now };
    case "cancelled":
      return order.isPaid
        ? { status: next, "paymentResult.status": "refunded" }
        : { status: next };
    default:
      return { status: next };
  }
}

/**
 * Moves an order to a new status, following `ORDER_TRANSITIONS`.
 *
 * Cancelling returns the stock. The status change and the stock increment share
 * a transaction, and the update is filtered on the status that was read, so two
 * admins cancelling at once cannot restock the same order twice.
 */
export async function updateOrderStatus(
  orderId: string,
  next: OrderStatus,
): Promise<Order> {
  await connectDB();

  if (!Types.ObjectId.isValid(orderId)) throw notFound("Order");

  const session = await mongoose.startSession();
  try {
    let updated: Order | null = null;

    await session.withTransaction(async () => {
      const order = await OrderModel.findById(orderId)
        .session(session)
        .lean<Order>();

      if (!order) throw notFound("Order");

      if (!ORDER_TRANSITIONS[order.status].includes(next)) {
        throw conflict(`An order that is ${order.status} cannot become ${next}`);
      }

      if (isPaymentInProgress(order)) {
        throw conflict("A payment for this order is in progress. Try again shortly.");
      }

      updated = await OrderModel.findOneAndUpdate(
        { _id: order._id, status: order.status },
        { $set: statusUpdate(order, next) },
        { returnDocument: "after", session },
      ).lean<Order>();

      if (!updated) throw conflict("This order just changed. Reload and try again.");

      if (next === "cancelled") {
        await ProductModel.bulkWrite(
          order.orderItems.map((item) => ({
            updateOne: {
              filter: { _id: item.product },
              update: { $inc: { countInStock: item.qty } },
            },
          })),
          { session },
        );
      }
    });

    if (!updated) throw conflict("This order could not be updated");
    return updated;
  } finally {
    await session.endSession();
  }
}

/**
 * Lets a customer cancel their own unpaid order, returning its stock.
 *
 * Paid orders go through an admin, since cancelling those means a refund.
 */
export async function cancelOwnOrder(
  orderId: string,
  userId: string,
): Promise<Order> {
  const order = await getOrderForUser(orderId, userId);

  if (order.status !== "pending") {
    throw conflict("Only an unpaid order can be cancelled");
  }

  return updateOrderStatus(orderId, "cancelled");
}

/**
 * Cancels unpaid orders past their time limit, returning their stock.
 *
 * Stock is taken when an order is created, so without this an abandoned or
 * declined order would hold it forever, and repeatedly ordering without paying
 * would empty the shop for free. There is no scheduler here, so it runs where
 * stock is about to matter: before each checkout and on the admin overview.
 *
 * Returns how many orders were released. An order that changes underneath this,
 * such as one being paid right now, is skipped and left for the next sweep.
 */
export async function releaseExpiredOrders(now = new Date()): Promise<number> {
  await connectDB();

  const cutoff = new Date(now.getTime() - UNPAID_ORDER_TTL_MINUTES * 60 * 1000);

  const expired = await OrderModel.find({
    status: "pending",
    isPaid: false,
    createdAt: { $lt: cutoff },
  })
    .select("_id")
    .limit(100)
    .lean();

  let released = 0;

  for (const order of expired) {
    try {
      await updateOrderStatus(String(order._id), "cancelled");
      released += 1;
    } catch (error) {
      if (!isServiceError(error)) throw error;
    }
  }

  return released;
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (ORDER_STATUSES as readonly unknown[]).includes(value);
}

export type DashboardStats = {
  revenue: number;
  orderCount: number;
  toShip: number;
  awaitingPayment: number;
  productCount: number;
  lowStock: { id: string; name: string; slug: string; countInStock: number }[];
};

export async function getDashboardStats(): Promise<DashboardStats> {
  await connectDB();

  const [revenue, statusCounts, productCount, lowStock] = await Promise.all([
    OrderModel.aggregate<{ cents: number }>([
      { $match: { isPaid: true, status: { $ne: "cancelled" } } },
      // Summed in cents, for the same reason as everywhere else (PLAN D13).
      {
        $group: {
          _id: null,
          cents: { $sum: { $round: [{ $multiply: ["$totalPrice", 100] }, 0] } },
        },
      },
    ]),
    OrderModel.aggregate<{ _id: OrderStatus; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    ProductModel.countDocuments({ isActive: true }),
    ProductModel.find({ isActive: true, countInStock: { $lte: LOW_STOCK_LEVEL } })
      .sort({ countInStock: 1, name: 1 })
      .limit(10)
      .select("name slug countInStock")
      .lean(),
  ]);

  const countFor = (status: OrderStatus) =>
    statusCounts.find((row) => row._id === status)?.count ?? 0;

  return {
    revenue: (revenue[0]?.cents ?? 0) / 100,
    orderCount: statusCounts.reduce((sum, row) => sum + row.count, 0),
    toShip: countFor("paid"),
    awaitingPayment: countFor("pending"),
    productCount,
    lowStock: lowStock.map((product) => ({
      id: String(product._id),
      name: product.name,
      slug: product.slug,
      countInStock: product.countInStock,
    })),
  };
}
