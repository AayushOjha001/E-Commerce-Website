/** Never served: only used to see where a path would resolve to. */
const PROBE_ORIGIN = "https://origin.invalid";

/**
 * Whether a browser would stay on this site when following the value.
 *
 * Asks a real URL parser rather than matching patterns, because parsers strip
 * tabs and newlines first: `/<tab>/evil.example` passes a `startsWith("//")`
 * check and then resolves to https://evil.example.
 */
function staysOnSite(value: string): boolean {
  try {
    return new URL(value, PROBE_ORIGIN).origin === PROBE_ORIGIN;
  } catch {
    return false;
  }
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

/**
 * Sanitises a post-login destination.
 *
 * Only a site-relative path is allowed. Accepting whatever arrives in `?next`
 * would turn the login page into an open redirect: `?next=https://evil.example`
 * would bounce a freshly authenticated user off-site. `//host` is rejected too,
 * since a protocol-relative URL is still absolute.
 *
 * Lives here rather than in actions.ts because a `"use server"` module may only
 * export async functions — a sync export there is a build error.
 */
export function safeRedirectPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  // Backslashes are normalised to slashes by some browsers, so `/\evil.example`
  // can escape the origin.
  if (value.includes("\\")) return fallback;
  if (hasControlCharacter(value) || !staysOnSite(value)) return fallback;
  // Never send someone back to an auth page: /login?next=/login would bounce an
  // already-signed-in visitor straight back to the login page.
  const path = value.split("?")[0];
  if (path === "/login" || path === "/register") return fallback;
  return value;
}
