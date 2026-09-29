import jwt from "jsonwebtoken";

import { env } from "@/lib/env";
import { USER_ROLES, type UserRole } from "@/server/models";

/**
 * Session token handling.
 *
 * Deliberately stateless and free of database access, so `proxy.ts` can verify a
 * request without a DB round trip — Next.js warns that proxy code runs separately
 * from render code and must not rely on shared state.
 *
 * The token is a bearer credential, so it is treated as untrusted input on the
 * way back in: every claim is re-validated after `jwt.verify`, because a valid
 * signature only proves *we* issued it, not that its shape is still what this
 * version of the code expects.
 */

/** Seven days, not the legacy app's 30 (audit B17 flagged that as too long). */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const ALGORITHM = "HS256";

export type SessionClaims = {
  userId: string;
  role: UserRole;
};

/** Signs a session token for a user. */
export function signSessionToken(claims: SessionClaims): string {
  return jwt.sign({ role: claims.role }, env().JWT_SECRET, {
    subject: claims.userId,
    algorithm: ALGORITHM,
    expiresIn: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Verifies a token and returns its claims, or null if it is unusable.
 *
 * Returns null rather than throwing: an expired or forged cookie is an ordinary
 * "not signed in", not an exceptional condition, and every caller would
 * otherwise need a try/catch to avoid turning a bad cookie into a 500.
 */
export function verifySessionToken(token: string): SessionClaims | null {
  try {
    const payload = jwt.verify(token, env().JWT_SECRET, {
      // Pinned: without this, a token could name its own algorithm, which is the
      // classic JWT confusion attack (`alg: "none"`, or HS256 verified against
      // an RSA public key).
      algorithms: [ALGORITHM],
    });

    if (typeof payload === "string" || payload === null) return null;

    const { sub, role } = payload;
    if (typeof sub !== "string" || sub.length === 0) return null;
    // An unknown role must not be trusted: if the enum ever shrinks, an old
    // token naming a removed role should fail closed rather than pass through.
    if (typeof role !== "string") return null;
    if (!(USER_ROLES as readonly string[]).includes(role)) return null;

    return { userId: sub, role: role as UserRole };
  } catch {
    return null;
  }
}
