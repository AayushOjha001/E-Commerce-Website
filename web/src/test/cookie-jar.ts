/**
 * An in-memory stand-in for Next.js's cookie store.
 *
 * Route handlers reach cookies through `next/headers`, which only exists inside
 * a request scope, so tests mock that module with this jar. It keeps the real
 * cookie *options* too, so tests can assert that the session cookie is actually
 * `httpOnly` rather than merely present.
 */
export type StoredCookie = {
  name: string;
  value: string;
  httpOnly?: boolean;
  sameSite?: string;
  secure?: boolean;
  path?: string;
  maxAge?: number;
};

export function createCookieJar() {
  const store = new Map<string, StoredCookie>();

  const cookieStore = {
    get(name: string) {
      const cookie = store.get(name);
      return cookie ? { name, value: cookie.value } : undefined;
    },
    getAll() {
      return [...store.values()].map(({ name, value }) => ({ name, value }));
    },
    has(name: string) {
      return store.has(name);
    },
    set(name: string, value: string, options: Omit<StoredCookie, "name" | "value"> = {}) {
      store.set(name, { name, value, ...options });
    },
    delete(name: string) {
      store.delete(name);
    },
  };

  return {
    cookieStore,
    /** The raw record, including the options it was written with. */
    raw: (name: string) => store.get(name),
    clear: () => store.clear(),
    /** Seeds a cookie as if the browser had sent it. */
    seed: (name: string, value: string) => store.set(name, { name, value }),
  };
}

export type CookieJar = ReturnType<typeof createCookieJar>;

// Note: there is deliberately no `mockNextHeaders(jar)` helper here. `vi.mock`
// is hoisted, so it has to appear at the top level of the test file itself;
// wrapping it in a function makes Vitest reject the module outright.
