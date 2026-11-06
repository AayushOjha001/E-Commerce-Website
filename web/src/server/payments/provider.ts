/**
 * Payment provider interface (PLAN D8, BL-2).
 *
 * Checkout talks only to this interface, so moving to Stripe test mode later
 * means writing one class and changing `paymentProvider` below, with no change
 * to the order service.
 */

export const PAYMENT_METHODS = ["test-approve", "test-decline"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  "test-approve": "Test payment that succeeds",
  "test-decline": "Test payment that is declined",
};

export type ChargeRequest = {
  amount: number;
  method: string;
  /**
   * Stable per order. A real provider uses this to collapse a retried or
   * concurrent request into one charge, which is why it is required here even
   * though the mock has nothing to deduplicate.
   */
  idempotencyKey: string;
};

export type ChargeResult =
  | { ok: true; id: string; status: "succeeded"; provider: string }
  | { ok: false; reason: string; provider: string };

export interface PaymentProvider {
  readonly name: string;
  charge(request: ChargeRequest): Promise<ChargeResult>;
}

/**
 * Settles immediately, with the outcome chosen by the payment method.
 *
 * The checkout offers named test outcomes rather than a card form on purpose:
 * this shop must never collect anything resembling real card details.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    if (request.method === "test-decline") {
      return {
        ok: false,
        reason: "The test payment was declined",
        provider: this.name,
      };
    }

    return {
      ok: true,
      id: `mock_${request.idempotencyKey}`,
      status: "succeeded",
      provider: this.name,
    };
  }
}

export const paymentProvider: PaymentProvider = new MockPaymentProvider();
