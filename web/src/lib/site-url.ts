const DEVELOPMENT_URL = "http://localhost:3000";

/**
 * The site's public origin, for absolute URLs in metadata and structured data.
 *
 * Social crawlers and search engines cannot resolve a relative image path, and
 * without this Next.js falls back to localhost when self-hosted. A malformed
 * value falls back too: a typo here should not take down every page.
 */
export function siteUrl(): URL {
  try {
    return new URL(process.env.SITE_URL ?? DEVELOPMENT_URL);
  } catch {
    return new URL(DEVELOPMENT_URL);
  }
}
