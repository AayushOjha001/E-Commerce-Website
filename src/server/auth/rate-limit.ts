import { rateLimited } from "@/server/services/errors";

/**
 * Limits failed logins, which audit R3 found unlimited.
 *
 * Two counters, because each alone has a hole. Per address and IP, a guesser
 * only has to spoof a new `X-Forwarded-For` each time. Per address alone, anyone
 * can lock a victim out by failing on purpose. So the pair is strict, and the
 * address alone gets a much higher ceiling that still bounds guessing.
 *
 * Only failures count, so a successful login costs nothing and clears the
 * strict counter.
 *
 * In memory, so limits apply per server process and reset on restart. Running
 * several instances needs a shared store such as Redis.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_CLIENT = 10;
const MAX_FAILURES_PER_ACCOUNT = 50;
/** Stops the map growing without limit under a flood of made-up addresses. */
const MAX_TRACKED_KEYS = 50_000;

type Counter = { count: number; resetAt: number };

const counters = new Map<string, Counter>();

function clientKey(email: string, ip: string): string {
  return `client:${email.trim().toLowerCase()}:${ip}`;
}

function accountKey(email: string): string {
  return `account:${email.trim().toLowerCase()}`;
}

function failures(key: string, now: number): number {
  const counter = counters.get(key);
  if (!counter) return 0;

  if (counter.resetAt <= now) {
    counters.delete(key);
    return 0;
  }
  return counter.count;
}

function bump(key: string, now: number): void {
  const count = failures(key, now);

  if (count === 0 && counters.size >= MAX_TRACKED_KEYS) {
    for (const [existing, counter] of counters) {
      if (counter.resetAt <= now) counters.delete(existing);
    }
    // Everything is still live, so drop the oldest rather than grow.
    if (counters.size >= MAX_TRACKED_KEYS) {
      const oldest = counters.keys().next().value;
      if (oldest !== undefined) counters.delete(oldest);
    }
  }

  counters.set(key, {
    count: count + 1,
    resetAt: counters.get(key)?.resetAt ?? now + WINDOW_MS,
  });
}

/** Throws `rate_limited` if this login may not even be attempted. */
export function assertLoginAllowed(
  email: string,
  ip: string,
  now = Date.now(),
): void {
  if (
    failures(clientKey(email, ip), now) >= MAX_FAILURES_PER_CLIENT ||
    failures(accountKey(email), now) >= MAX_FAILURES_PER_ACCOUNT
  ) {
    throw rateLimited("Too many failed attempts. Try again in 15 minutes.");
  }
}

export function recordLoginFailure(
  email: string,
  ip: string,
  now = Date.now(),
): void {
  bump(clientKey(email, ip), now);
  bump(accountKey(email), now);
}

/** Clears the strict counter. The account total stands, so success cannot reset it. */
export function recordLoginSuccess(email: string, ip: string): void {
  counters.delete(clientKey(email, ip));
}

/** For tests. */
export function resetLoginLimits(): void {
  counters.clear();
}

/**
 * The client's address as reported by the proxy in front of the app.
 *
 * Spoofable when nothing in front overwrites the header, which is why this is
 * never the only thing a limit relies on.
 */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
