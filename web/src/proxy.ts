import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/server/auth/session";
import { verifySessionToken } from "@/server/auth/tokens";

/**
 * Route protection for page requests.
 *
 * Named `proxy`, not `middleware`: Next.js 16 renamed the file convention and
 * the exported function, and the `edge` runtime is not supported here (proxy
 * always runs on `nodejs`), which is what lets it verify a JWT with
 * `jsonwebtoken`.
 *
 * **This is a convenience, not the security boundary.** It redirects signed-out
 * visitors before a protected page renders, so they see a login form instead of
 * an empty account page. Authorisation is still enforced independently by
 * `requireUser()` / `requireAdmin()` inside every handler, server action and
 * protected page — so a path the matcher fails to cover is not thereby exposed.
 * Verification here is stateless (signature and claims only, no database), as
 * Next.js requires of proxy code.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? verifySessionToken(token) : null;

  if (!claims) {
    const loginUrl = new URL("/login", request.url);
    // Round-trip the destination so login can send them back where they meant
    // to go. `pathname + search` only — never an absolute URL from user input,
    // which would make this an open redirect.
    loginUrl.searchParams.set("next", `${pathname}${search}`);

    const response = NextResponse.redirect(loginUrl);

    // Clear a cookie that failed verification (expired or tampered), so the
    // browser stops resending it on every subsequent request.
    if (token) response.cookies.delete(SESSION_COOKIE);

    return response;
  }

  if (pathname.startsWith("/admin") && claims.role !== "admin") {
    // Rewrite to the 404 rather than redirecting: a signed-in non-admin should
    // not be able to tell that /admin exists. `requireAdmin()` does the same.
    return NextResponse.rewrite(new URL("/not-found", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Only the private surfaces. Everything else — the catalog, product pages,
  // /login, /register and all the API routes — is left alone, because the API
  // must answer with JSON 403s rather than redirect to an HTML login page.
  matcher: ["/account/:path*", "/checkout/:path*", "/admin/:path*"],
};
