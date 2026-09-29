import { cookies } from "next/headers";

import { forbidden, notFound } from "@/server/services/errors";
import { getUserById, type PublicUser } from "@/server/services/users";
import {
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  verifySessionToken,
  type SessionClaims,
} from "./tokens";

/**
 * Name of the session cookie.
 *
 * The `__Host-` prefix is not used: browsers only accept it over HTTPS, so it
 * would break local development over http://localhost.
 */
export const SESSION_COOKIE = "session";

/**
 * Writes the session cookie.
 *
 * `httpOnly` is the point of the exercise: the legacy app kept its JWT in
 * `localStorage` (audit B17), where any XSS could read it. A cookie the
 * document cannot see cannot be exfiltrated by injected script.
 *
 * Only callable from a Route Handler or Server Action — Next.js does not allow
 * setting cookies while rendering a Server Component.
 */
export async function setSessionCookie(claims: SessionClaims): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, signSessionToken(claims), {
    httpOnly: true,
    // Lax, not Strict: Strict would drop the cookie when arriving from an
    // external link, so a signed-in user following one would appear signed out.
    // Lax still blocks the cross-site POSTs that matter for CSRF.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/** Reads and verifies the session claims, without touching the database. */
export async function getSessionClaims(): Promise<SessionClaims | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  return token ? verifySessionToken(token) : null;
}

/**
 * The signed-in user, loaded from the database, or null.
 *
 * Goes back to the database rather than trusting the token's claims for
 * anything but identity: a role in a week-old token may be stale, and a user
 * deleted since it was issued must not still appear signed in.
 */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const claims = await getSessionClaims();
  if (!claims) return null;

  return getUserById(claims.userId);
}

/**
 * The signed-in user, or a `forbidden` ServiceError.
 *
 * For route handlers and server actions. `proxy.ts` redirects unauthenticated
 * *page* requests before they render, but that is a convenience, not the
 * security boundary — every protected handler checks for itself, so a route the
 * matcher misses is still safe.
 */
export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) throw forbidden("You must be signed in");
  return user;
}

/**
 * The signed-in user, who must be an admin.
 *
 * The legacy app had no admin check anywhere — `POST /api/products` accepted
 * writes with no token at all (audit B5) — despite `User.isAdmin` existing.
 */
export async function requireAdmin(): Promise<PublicUser> {
  const user = await requireUser();

  if (user.role !== "admin") {
    // Deliberately `not_found`, which the error mapper turns into a 404: a 403
    // would confirm to a non-admin that the admin surface exists at that URL.
    throw notFound("Page");
  }

  return user;
}
