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
  return value;
}
