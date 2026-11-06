import { env, EnvValidationError } from "@/lib/env";
import { connectDB } from "@/server/db/connect";

export type HealthStatus = {
  status: "ok" | "degraded";
  db: "connected" | "disconnected";
  /** Coarse, non-identifying reason. Never a validator message or stack trace. */
  reason?: "configuration_error" | "database_unreachable";
};

/**
 * Checks liveness of the app and its database.
 *
 * Actually issues a `ping` admin command rather than trusting the connection
 * state, so a stale or half-open socket reports as disconnected.
 *
 * The response body is deliberately terse. This endpoint is unauthenticated, so
 * it must not echo which environment variables are missing, nor any filesystem
 * path — the legacy Express app leaked absolute paths this way (audit B6).
 * Details go to the server log only.
 */
export async function getHealth(): Promise<HealthStatus> {
  // Validate configuration first and report it distinctly. Folding this into the
  // database try-block would blame a perfectly healthy DB for a config typo and
  // send an operator hunting the wrong problem.
  try {
    env();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error("[health] environment validation failed:", error.message);
      return {
        status: "degraded",
        db: "disconnected",
        reason: "configuration_error",
      };
    }
    throw error;
  }

  try {
    const mongooseInstance = await connectDB();
    const db = mongooseInstance.connection.db;

    if (!db) {
      console.error("[health] no database handle on the connection");
      return {
        status: "degraded",
        db: "disconnected",
        reason: "database_unreachable",
      };
    }

    await db.admin().command({ ping: 1 });
    return { status: "ok", db: "connected" };
  } catch (error) {
    console.error(
      "[health] database unreachable:",
      error instanceof Error ? error.message : error,
    );
    return {
      status: "degraded",
      db: "disconnected",
      reason: "database_unreachable",
    };
  }
}
