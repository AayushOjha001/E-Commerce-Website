import mongoose, { type Mongoose } from "mongoose";

import { env } from "@/lib/env";

/** `mongoose.ConnectionStates.connected` — the only state safe to reuse. */
const CONNECTED = 1;

type ConnectionCache = {
  conn: Mongoose | null;
  /** Set only while a connect attempt is in flight, so concurrent callers share it. */
  promise: Promise<Mongoose> | null;
};

/**
 * The cache is stashed on `globalThis` deliberately.
 *
 * Next.js clears the module registry on every hot reload in dev, so a
 * module-scoped variable would be reinitialised each time and open a fresh
 * connection pool per edit until MongoDB refuses new connections. `globalThis`
 * survives reloads, so we reuse the one pool.
 */
const globalForMongoose = globalThis as typeof globalThis & {
  __mongooseCache?: ConnectionCache;
};

const cache: ConnectionCache = (globalForMongoose.__mongooseCache ??= {
  conn: null,
  promise: null,
});

/**
 * Returns a connected Mongoose instance, reusing an existing connection.
 *
 * Concurrent callers share a single in-flight attempt, so a burst of requests
 * during cold start does not open several pools. A connection that has since
 * dropped is discarded and re-established rather than handed back dead.
 */
export async function connectDB(): Promise<Mongoose> {
  // Checking the handle alone is not enough: if the socket drops, the cached
  // instance stays truthy but every query fails immediately (bufferCommands is
  // off), leaving the process permanently degraded until it restarts.
  if (cache.conn?.connection.readyState === CONNECTED) {
    return cache.conn;
  }

  // Either never connected, or the connection went stale. Drop the handle; the
  // promise is cleared on settle below, so a non-null promise here is genuinely
  // still in flight and is safe (and desirable) to share.
  cache.conn = null;

  cache.promise ??= mongoose
    .connect(env().MONGODB_URI, {
      // Fail fast instead of buffering commands for 30s when the DB is down, so
      // /api/health reports unhealthy quickly rather than hanging.
      bufferCommands: false,
      serverSelectionTimeoutMS: 5_000,
    })
    .then((instance) => {
      cache.conn = instance;
      return instance;
    })
    .finally(() => {
      // Always clear, on success and on failure. A retained resolved promise
      // would be replayed forever by the `??=` above, defeating the
      // staleness check; a retained rejected one would cache the failure.
      cache.promise = null;
    });

  return cache.promise;
}

/** Closes the connection and clears the cache. For tests and shutdown hooks. */
export async function disconnectDB(): Promise<void> {
  if (cache.conn) {
    await cache.conn.disconnect();
  }
  cache.conn = null;
  cache.promise = null;
}
