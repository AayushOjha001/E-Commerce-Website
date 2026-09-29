import Link from "next/link";

import { logoutAction } from "@/server/auth/actions";
import { getCurrentUser } from "@/server/auth/session";

/**
 * Site header.
 *
 * A server component, so it reads the session directly and renders the right
 * links on the first paint — no loading flicker and no client-side auth state to
 * drift. The legacy Navbar.jsx was static: it always showed "Login" and
 * "Register", with no idea whether anyone was signed in (audit C1).
 */
export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          E-Shop
        </Link>

        <div className="flex items-center gap-4 text-sm">
          <Link href="/cart" className="hover:underline underline-offset-4">
            Cart
          </Link>

          {user ? (
            <>
              {user.role === "admin" ? (
                <Link href="/admin" className="hover:underline underline-offset-4">
                  Admin
                </Link>
              ) : null}

              <Link href="/account" className="hover:underline underline-offset-4">
                {user.name}
              </Link>

              {/* A form, not a link: signing out is a state change, so it must
                  not be reachable by a prefetch or a crawler following a GET. */}
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="rounded-md border border-black/15 px-3 py-1 transition hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:underline underline-offset-4">
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-blue-600 px-3 py-1 font-medium text-white transition hover:bg-blue-500"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
