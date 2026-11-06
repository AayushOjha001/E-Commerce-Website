import mongoose from "mongoose";
import { afterAll, describe, expect, it, vi } from "vitest";

import { connectDB, disconnectDB } from "@/server/db/connect";
import { getHealth } from "@/server/services/health";

/**
 * Integration test against the docker-compose MongoDB (host port 27018).
 *
 * Skipped rather than failed when the DB is down, so `npm test` still passes on
 * a fresh clone that has not run `docker compose up -d mongo`. Set `REQUIRE_DB=1`
 * (as CI does) to turn an unreachable database into a hard failure instead —
 * otherwise a broken CI service would silently erase this coverage.
 */
const dbReachable = await connectDB().then(
  () => true,
  () => false,
);

const requireDb = process.env.REQUIRE_DB === "1";

afterAll(async () => {
  await disconnectDB();
});

describe("database availability", () => {
  it.runIf(requireDb)("is reachable, because REQUIRE_DB=1", () => {
    expect(dbReachable).toBe(true);
  });
});

describe.skipIf(!dbReachable)("getHealth against a live database", () => {
  it("reports ok and connected, with no reason field", async () => {
    const health = await getHealth();

    expect(health).toEqual({ status: "ok", db: "connected" });
  });

  it("opens only one connection across repeated calls", async () => {
    // Asserting `second === first` would be a tautology: mongoose.connect()
    // always resolves to the mongoose singleton, so that passes even with the
    // cache deleted entirely. Spy on the driver call instead.
    await connectDB();
    const connectSpy = vi.spyOn(mongoose, "connect");

    try {
      await Promise.all([connectDB(), connectDB(), connectDB()]);
      expect(connectSpy).not.toHaveBeenCalled();
    } finally {
      connectSpy.mockRestore();
    }
  });

  it("dedupes concurrent cold-start calls into a single connect", async () => {
    await disconnectDB();
    const connectSpy = vi.spyOn(mongoose, "connect");

    try {
      const results = await Promise.all([
        connectDB(),
        connectDB(),
        connectDB(),
        connectDB(),
      ]);

      expect(connectSpy).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(4);
    } finally {
      connectSpy.mockRestore();
    }
  });

  it("reconnects instead of returning a dead handle", async () => {
    await connectDB();
    // Simulate the socket dropping without going through disconnectDB(), so the
    // cached handle stays in place but is no longer usable.
    await mongoose.connection.close();
    expect(mongoose.connection.readyState).not.toBe(1);

    const reconnected = await connectDB();

    expect(reconnected.connection.readyState).toBe(1);
    await expect(getHealth()).resolves.toEqual({
      status: "ok",
      db: "connected",
    });
  });
});
