import type { OrderStatus } from "@/server/models/order";

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Awaiting payment",
  paid: "Paid",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_TONES: Record<OrderStatus, string> = {
  pending: "bg-danger-wash text-danger",
  paid: "bg-sky text-ink",
  shipped: "bg-sky text-ink",
  delivered: "bg-success-wash text-success",
  cancelled: "bg-ink/10 text-ink",
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-sm font-semibold ${STATUS_TONES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const STEPS: OrderStatus[] = ["pending", "paid", "shipped", "delivered"];
const STEP_LABELS: Record<string, string> = {
  pending: "Placed",
  paid: "Paid",
  shipped: "Shipped",
  delivered: "Delivered",
};

/**
 * Where an order has got to. A real sequence, so it is shown as one.
 *
 * Not shown for a cancelled order, whose status pill already says everything
 * and which has no next step.
 */
export function OrderProgress({ status }: { status: OrderStatus }) {
  if (status === "cancelled") return null;

  const current = STEPS.indexOf(status);

  return (
    <ol className="grid grid-cols-4 gap-1">
      {STEPS.map((step, index) => {
        const reached = index <= current;

        return (
          <li
            key={step}
            aria-current={index === current ? "step" : undefined}
            className={`border-t-[6px] pt-1.5 text-sm ${
              reached
                ? "border-ink font-semibold text-ink"
                : "border-ink/15 text-ink-soft"
            }`}
          >
            {STEP_LABELS[step]}
          </li>
        );
      })}
    </ol>
  );
}
