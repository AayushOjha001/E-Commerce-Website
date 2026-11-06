import { describe, expect, it, vi } from "vitest";

import type { HealthStatus } from "@/server/services/health";

// The handler's own job is the status-code mapping, so the service is stubbed.
vi.mock("@/server/services/health", () => ({
  getHealth: vi.fn(),
}));

const { getHealth } = await import("@/server/services/health");
const { GET, dynamic } = await import("@/app/api/health/route");

describe("GET /api/health", () => {
  it("returns 200 and the body when healthy", async () => {
    const healthy: HealthStatus = { status: "ok", db: "connected" };
    vi.mocked(getHealth).mockResolvedValue(healthy);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(healthy);
  });

  it("returns 503 when degraded, so probes can act on the status code", async () => {
    const degraded: HealthStatus = {
      status: "degraded",
      db: "disconnected",
      reason: "database_unreachable",
    };
    vi.mocked(getHealth).mockResolvedValue(degraded);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(degraded);
  });

  it("returns 503 for a configuration error too", async () => {
    vi.mocked(getHealth).mockResolvedValue({
      status: "degraded",
      db: "disconnected",
      reason: "configuration_error",
    });

    expect((await GET()).status).toBe(503);
  });

  it("is never prerendered, so it reflects state at request time", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
