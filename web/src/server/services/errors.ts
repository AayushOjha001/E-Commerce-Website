/**
 * Service-layer errors.
 *
 * Deliberately transport-agnostic: no status codes, no `res`. Route handlers map
 * these to HTTP in Batch 3 (T3.3), and server components can catch them too.
 * Keeping HTTP out of here is what lets one service back both an API route and a
 * server component.
 */

export type ServiceErrorCode =
  | "not_found"
  | "validation"
  | "conflict"
  | "unauthenticated"
  | "forbidden"
  | "out_of_stock";

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  /** Field-level detail for validation failures, keyed by field name. */
  readonly details?: Record<string, string>;

  constructor(
    code: ServiceErrorCode,
    message: string,
    details?: Record<string, string>,
  ) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what: string) =>
  new ServiceError("not_found", `${what} not found`);

export const validationFailed = (
  message: string,
  details?: Record<string, string>,
) => new ServiceError("validation", message, details);

export const conflict = (message: string) =>
  new ServiceError("conflict", message);

/**
 * Not signed in at all — distinct from `forbidden`, which means signed in but
 * not allowed. Without the distinction a client cannot tell "log in" from
 * "you will never be allowed", and both would answer 403.
 */
export const unauthenticated = (message = "You must be signed in") =>
  new ServiceError("unauthenticated", message);

/**
 * Used when a user tries to reach something that is not theirs.
 *
 * The audit found `GET /api/orders/:id` returned any user's order to any
 * authenticated caller (B4).
 */
export const forbidden = (message = "You do not have access to this resource") =>
  new ServiceError("forbidden", message);

export const outOfStock = (productName: string, available: number) =>
  new ServiceError(
    "out_of_stock",
    available === 0
      ? `${productName} is out of stock`
      : `Only ${available} of ${productName} left in stock`,
  );

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}
