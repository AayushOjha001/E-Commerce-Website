import { jsonOk, withErrorHandling } from "@/server/api/respond";
import { clearSessionCookie } from "@/server/auth/session";

/**
 * Ends the session. The legacy app had no logout at all — its 30-day token
 * simply stayed in localStorage until it expired.
 *
 * POST rather than GET so a stray <img> or link prefetch cannot sign a user out.
 * Succeeds even when not signed in, so it is safe to call blindly.
 */
export const POST = withErrorHandling(async () => {
  await clearSessionCookie();
  return jsonOk({ ok: true });
});
