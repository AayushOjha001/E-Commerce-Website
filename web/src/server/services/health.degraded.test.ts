import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Lives in its own file because `vi.mock` is hoisted and applies to the whole
// module graph of the file it appears in; the happy path needs the real module.
vi.mock("@/server/db/connect", () => ({
  connectDB: vi.fn(),
  disconnectDB: vi.fn(),
}));

const { connectDB } = await import("@/server/db/connect");
const { getHealth } = await import("@/server/services/health");
const { resetEnvCache } = await import("@/lib/env");

describe("getHealth when the database is unreachable", () => {
  beforeEach(() => {
    vi.mocked(connectDB).mockReset();
    // Errors are logged server-side by design; keep the test output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports degraded instead of throwing", async () => {
    vi.mocked(connectDB).mockRejectedValue(
      new Error("connect ECONNREFUSED 127.0.0.1:27018"),
    );

    const health = await getHealth();

    expect(health).toEqual({
      status: "degraded",
      db: "disconnected",
      reason: "database_unreachable",
    });
  });

  it("reports degraded when the connection has no database handle", async () => {
    // A connected Mongoose whose `connection.db` is undefined - what a
    // half-open or still-initialising connection looks like.
    vi.mocked(connectDB).mockResolvedValue({
      connection: { db: undefined },
    } as unknown as Awaited<ReturnType<typeof connectDB>>);

    const health = await getHealth();

    expect(health.status).toBe("degraded");
    expect(health.reason).toBe("database_unreachable");
  });

  it("never leaks the underlying error text to the caller (audit B6)", async () => {
    vi.mocked(connectDB).mockRejectedValue(
      new Error("ECONNREFUSED at C:/Study/Programming/secret/path.ts:28"),
    );

    const health = await getHealth();
    const serialised = JSON.stringify(health);

    expect(serialised).not.toMatch(/ECONNREFUSED/);
    expect(serialised).not.toMatch(/C:\//);
    expect(serialised).not.toMatch(/\.ts:\d+/);
    // The detail still reaches the operator via the server log.
    expect(console.error).toHaveBeenCalled();
  });

  it("handles a non-Error rejection safely", async () => {
    vi.mocked(connectDB).mockRejectedValue("a bare string");

    const health = await getHealth();

    expect(health.status).toBe("degraded");
    expect(health.reason).toBe("database_unreachable");
  });
});

describe("getHealth when the environment is invalid", () => {
  const savedSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    vi.mocked(connectDB).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    resetEnvCache();
  });

  afterEach(() => {
    process.env.JWT_SECRET = savedSecret;
    resetEnvCache();
    vi.restoreAllMocks();
  });

  it("reports a configuration error, not a database failure", async () => {
    delete process.env.JWT_SECRET;

    const health = await getHealth();

    expect(health.reason).toBe("configuration_error");
    expect(health.status).toBe("degraded");
    // Must not blame the database, and must not have tried to reach it.
    expect(connectDB).not.toHaveBeenCalled();
  });

  it("does not disclose which variables are invalid", async () => {
    delete process.env.JWT_SECRET;

    const serialised = JSON.stringify(await getHealth());

    expect(serialised).not.toMatch(/JWT_SECRET/);
    expect(serialised).not.toMatch(/\.env/);
  });
});
