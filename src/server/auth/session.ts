import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { notFound, unauthenticated } from "@/server/services/errors";
import { UserModel } from "@/server/models";
import { connectDB } from "@/server/db/connect";
import { toPublicUser, type PublicUser } from "@/server/services/users";
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

/**
 * Starts a session for a user id, reading the current role and token version.
 *
 * The single way callers create a session, so none of them can forget the token
 * version and mint a cookie that is stale the moment it is issued.
 */
export async function startSession(userId: string): Promise<void> {
  await connectDB();

  const user = await UserModel.findById(userId).select("+tokenVersion");
  if (!user) throw unauthenticated("Account not found");

  await setSessionCookie({
    userId: String(user._id),
    role: user.role,
    tokenVersion: user.tokenVersion ?? 0,
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
 *
 * Also enforces the password-change cutoff. Sessions are stateless JWTs, so
 * without this a token stolen before a password change would outlive the very
 * change meant to stop it.
 */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const claims = await getSessionClaims();
  if (!claims) return null;

  await connectDB();
  // `tokenVersion` is select:false, like the hash, so ask for it.
  const user = await UserModel.findById(claims.userId).select("+tokenVersion");
  if (!user) return null;

  // A token minted before the last password change carries an older version.
  if (claims.tokenVersion !== (user.tokenVersion ?? 0)) return null;

  return toPublicUser(user);
}

/**
 * The signed-in user, or an `unauthenticated` ServiceError (401).
 *
 * For **route handlers and server actions**, where throwing is mapped to JSON by
 * `withErrorHandling`. Server Components must use `requireUserForPage` instead —
 * a throw there hits the error boundary and renders a 500.
 *
 * `proxy.ts` redirects unauthenticated page requests before they render, but
 * that is a convenience, not the security boundary: every protected handler
 * checks for itself, so a route the matcher misses is still safe.
 */
export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthenticated();
  return user;
}

/**
 * The signed-in user, who must be an admin. For route handlers and actions.
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

/**
 * The signed-in user, for a **Server Component**, redirecting if there is none.
 *
 * Pages cannot throw their way to a login screen: a `ServiceError` raised while
 * rendering reaches the error boundary and the visitor gets a 500. That is
 * reachable in normal use — a token stays cryptographically valid after its
 * account is deleted, and `npm run seed` recreates users with new ids, so a
 * developer's own live cookie starts pointing at nothing.
 *
 * `proxy.ts` cannot cover this either: it verifies statelessly and has no way to
 * know the subject no longer exists.
 */
export async function requireUserForPage(
  currentPath = "/account",
): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (user) return user;

  redirect(`/login?next=${encodeURIComponent(currentPath)}`);
}

/** As `requireUserForPage`, but the user must be an admin. */
export async function requireAdminForPage(
  currentPath = "/admin",
): Promise<PublicUser> {
  const user = await requireUserForPage(currentPath);

  // Same concealment as requireAdmin: a non-admin sees a 404, not a 403.
  if (user.role !== "admin") {
    const { notFound: renderNotFound } = await import("next/navigation");
    renderNotFound();
  }

  return user;
}
