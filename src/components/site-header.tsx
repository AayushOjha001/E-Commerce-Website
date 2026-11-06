import Form from "next/form";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";

import { buttonClass, INPUT_CLASS } from "@/components/ui";
import { logoutAction } from "@/server/auth/actions";
import { getCurrentUser } from "@/server/auth/session";
import { getCart } from "@/server/services/cart";
import { MAX_SEARCH_LENGTH } from "@/server/services/catalog-query";

/**
 * Site header.
 *
 * A server component, so it reads the session directly and renders the right
 * links on the first paint: no loading flicker and no client-side auth state to
 * drift. The legacy Navbar.jsx was static: it always showed "Login" and
 * "Register", with no idea whether anyone was signed in (audit C1).
 *
 * The header renders inside the root layout, above every error boundary, so a
 * throw here would blank the whole site. If the database is down it degrades to
 * the signed-out view and the page below reports the failure itself.
 */
export async function loadHeaderState() {
  try {
    const user = await getCurrentUser();
    if (!user) return { user: null, cartCount: 0 };

    const cart = await getCart(user.id);
    return { user, cartCount: cart.itemCount };
  } catch (error) {
    // Next.js signals dynamic rendering by throwing, and reading cookies is how
    // this header triggers it. Swallowing that signal would let a page be built
    // as static, with one visitor's header served to everyone.
    unstable_rethrow(error);

    console.error("[header] could not load session:", error);
    return { user: null, cartCount: 0 };
  }
}

export async function SiteHeader() {
  const { user, cartCount } = await loadHeaderState();

  return (
    <header className="bg-paper">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6"
      >
        <Link href="/" className="display text-2xl sm:text-3xl">
          E-Shop
        </Link>

        <Link
          href="/products"
          className="font-medium underline-offset-4 hover:underline"
        >
          All products
        </Link>

        <Form
          action="/products"
          role="search"
          className="order-last w-full md:order-none md:w-auto md:max-w-sm md:flex-1"
        >
          <label htmlFor="site-search" className="sr-only">
            Search products
          </label>
          <input
            id="site-search"
            name="search"
            type="search"
            maxLength={MAX_SEARCH_LENGTH}
            placeholder="Search products"
            className={INPUT_CLASS}
          />
        </Form>

        <div className="ml-auto flex items-center gap-4 text-sm sm:text-base">
          <Link href="/cart" className="font-medium underline-offset-4 hover:underline">
            Cart
            {cartCount > 0 ? (
              <span className="price ml-1.5 inline-block rounded-md bg-ink px-1.5 text-sm font-semibold text-paper">
                <span className="sr-only">, items: </span>
                {cartCount}
              </span>
            ) : null}
          </Link>

          {user ? (
            <>
              {user.role === "admin" ? (
                <Link
                  href="/admin"
                  className="font-medium underline-offset-4 hover:underline"
                >
                  Admin
                </Link>
              ) : null}

              <Link
                href="/account"
                className="font-medium underline-offset-4 hover:underline"
              >
                {user.name}
              </Link>

              {/* A form, not a link: signing out is a state change, so it must
                  not be reachable by a prefetch or a crawler following a GET. */}
              <form action={logoutAction}>
                <button
                  type="submit"
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="font-medium underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
              {/* Wrapped, because `hidden` loses to the button's own display. */}
              <span className="hidden sm:inline">
                <Link href="/register" className={buttonClass({ size: "sm" })}>
                  Register
                </Link>
              </span>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
