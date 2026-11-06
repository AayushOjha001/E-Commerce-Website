import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getCart = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({ getCurrentUser }));
vi.mock("@/server/services/cart", () => ({ getCart }));
vi.mock("@/server/auth/actions", () => ({ logoutAction: vi.fn() }));

const { loadHeaderState } = await import("./site-header");

describe("loadHeaderState", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    getCart.mockReset();
  });

  it("is empty for a guest, without touching the cart", async () => {
    getCurrentUser.mockResolvedValue(null);

    await expect(loadHeaderState()).resolves.toEqual({ user: null, cartCount: 0 });
    expect(getCart).not.toHaveBeenCalled();
  });

  it("carries the signed-in user and their cart count", async () => {
    const user = { id: "1", name: "Ada" };
    getCurrentUser.mockResolvedValue(user);
    getCart.mockResolvedValue({ itemCount: 3 });

    await expect(loadHeaderState()).resolves.toEqual({ user, cartCount: 3 });
  });

  it("falls back to the guest view when the database is down", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getCurrentUser.mockRejectedValue(new Error("connection refused"));

    await expect(loadHeaderState()).resolves.toEqual({ user: null, cartCount: 0 });
    expect(log).toHaveBeenCalled();

    log.mockRestore();
  });

  it("lets Next.js's dynamic rendering signal through", async () => {
    const signal = Object.assign(new Error("Dynamic server usage"), {
      digest: "DYNAMIC_SERVER_USAGE",
    });
    getCurrentUser.mockRejectedValue(signal);

    await expect(loadHeaderState()).rejects.toBe(signal);
  });
});
