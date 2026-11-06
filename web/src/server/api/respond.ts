import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  ServiceError,
  isServiceError,
  type ServiceErrorCode,
} from "@/server/services/errors";

/**
 * One place that turns anything thrown into an HTTP response.
 *
 * The legacy Express app registered no error middleware at all, so every throw
 * fell through to Express's default handler and came back as an **HTML page
 * containing a stack trace and absolute filesystem paths** —
 * `C:/Study/.../authMiddleware.js:28:15` (audit B6). It also broke the
 * frontend, which read `err.response?.data.message`: always `undefined`.
 *
 * Every handler returns `{ message }` JSON, and nothing else ever escapes.
 */

export type ApiErrorBody = {
  message: string;
  /** Field-level detail for validation failures. */
  details?: Record<string, string>;
};

const STATUS_BY_CODE: Record<ServiceErrorCode, number> = {
  not_found: 404,
  validation: 400,
  conflict: 409,
  // 401 "who are you" vs 403 "not you": a client that gets 401 knows signing in
  // may help, where 403 means it never will.
  unauthenticated: 401,
  forbidden: 403,
  // 409: the request was well-formed, but the world changed under it.
  out_of_stock: 409,
};

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(
  message: string,
  status: number,
  details?: Record<string, string>,
): NextResponse {
  const body: ApiErrorBody = details ? { message, details } : { message };
  return NextResponse.json(body, { status });
}

/** Flattens a ZodError into `{ field: message }`. */
export function zodDetails(error: ZodError): Record<string, string> {
  const details: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    // Keep the first message per field: a form shows one error per input.
    details[key] ??= issue.message;
  }

  return details;
}

/**
 * Maps a thrown value to a response.
 *
 * Anything that is not a recognised error becomes a bare 500 with a fixed
 * message. The real error is logged server-side, never serialised to the
 * client — that is the whole point of B6.
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (isServiceError(error)) {
    return jsonError(
      error.message,
      STATUS_BY_CODE[error.code] ?? 500,
      error.details,
    );
  }

  if (error instanceof ZodError) {
    return jsonError("Invalid request", 400, zodDetails(error));
  }

  // Mongoose validation is a last line of defence; zod should have caught it.
  if (isMongooseValidationError(error)) {
    return jsonError("Invalid request", 400);
  }

  console.error("[api] unhandled error:", error);
  return jsonError("Something went wrong", 500);
}

function isMongooseValidationError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "ValidationError"
  );
}

/**
 * Wraps a route handler so no throw can escape as an HTML error page.
 *
 * Handlers stay linear — they `throw notFound(...)` and let this map it —
 * instead of every one carrying its own try/catch.
 */
export function withErrorHandling<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<NextResponse>,
): (...args: TArgs) => Promise<NextResponse> {
  return async (...args: TArgs) => {
    try {
      return await handler(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/** Parses a JSON body, turning malformed JSON into a 400 rather than a 500. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ServiceError("validation", "Request body must be valid JSON");
  }
}
