import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearDatabase,
  dbReachable,
  requireDb,
  setupTestDatabase,
  teardownTestDatabase,
} from "@/test/db";

const jar = await vi.hoisted(async () => {
  const { createCookieJar } = await import("@/test/cookie-jar");
  return createCookieJar();
});

vi.mock("next/headers", () => ({
  cookies: async () => jar.cookieStore,
}));

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`REDIRECT:${to}`);
  }
}
class NotFoundSignal extends Error {}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
  notFound: () => {
    throw new NotFoundSignal("NEXT_NOT_FOUND");
  },
}));

const {
  getCurrentUser,
  requireAdmin,
  requireAdminForPage,
  requireUser,
  requireUserForPage,
  startSession,
} = await import("@/server/auth/session");
const { UserModel } = await import("@/server/models");
const { createUser } = await import("@/server/services/users");

async function makeUser(role: "customer" | "admin" = "customer") {
  return createUser({
    name: role === "admin" ? "Admin" : "Ada",
    email: `${role}-${Math.random()}@example.com`,
    password: "a-good-password",
    role,
  });
}

describe("database availability", () => {
  it.runIf(requireDb)("is reachable, because REQUIRE_DB=1", () => {
    expect(dbReachable).toBe(true);
  });
});

describe.skipIf(!dbReachable)("session guards", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);

  beforeEach(async () => {
    await clearDatabase();
    jar.clear();
  });

  describe("requireUser", () => {
    it("returns the signed-in user", async () => {
      const user = await makeUser();
      await startSession(user.id);

      await expect(requireUser()).resolves.toMatchObject({ id: user.id });
    });

    it("throws unauthenticated when signed out", async () => {
      await expect(requireUser()).rejects.toMatchObject({
        code: "unauthenticated",
      });
    });
  });

  describe("requireAdmin", () => {
    it("returns an admin", async () => {
      const admin = await makeUser("admin");
      await startSession(admin.id);

      await expect(requireAdmin()).resolves.toMatchObject({ role: "admin" });
    });

    it("hides the surface from a customer with not_found, not forbidden", async () => {
      // A 403 would confirm to a non-admin that the admin surface exists.
      const customer = await makeUser("customer");
      await startSession(customer.id);

      await expect(requireAdmin()).rejects.toMatchObject({
        code: "not_found",
      });
    });

    it("reports unauthenticated, not not_found, when signed out", async () => {
      // Signing in might help here, so the distinction matters.
      await expect(requireAdmin()).rejects.toMatchObject({
        code: "unauthenticated",
      });
    });

    it("re-reads the role from the database, not the token", async () => {
      const user = await makeUser("admin");
      await startSession(user.id);

      // Demoted after the token was minted; the stale claim must not win.
      await UserModel.findByIdAndUpdate(user.id, { role: "customer" });

      await expect(requireAdmin()).rejects.toMatchObject({ code: "not_found" });
    });
  });

  describe("requireUserForPage", () => {
    it("returns the user when signed in", async () => {
      const user = await makeUser();
      await startSession(user.id);

      await expect(requireUserForPage("/account")).resolves.toMatchObject({
        id: user.id,
      });
    });

    it("redirects instead of throwing, so a page does not render a 500", async () => {
      // A ServiceError thrown while rendering reaches the error boundary and the
      // visitor gets a 500 rather than a login form.
      await expect(requireUserForPage("/account")).rejects.toBeInstanceOf(
        RedirectSignal,
      );
    });

    it("redirects a valid token whose account no longer exists", async () => {
      // Reachable in normal use: `npm run seed` recreates users with new ids, so
      // a live cookie starts pointing at nothing.
      const user = await makeUser();
      await startSession(user.id);
      await UserModel.deleteMany({});

      await expect(requireUserForPage("/account")).rejects.toMatchObject({
        to: "/login?next=%2Faccount",
      });
    });

    it("round-trips the path it was asked to protect", async () => {
      await expect(requireUserForPage("/checkout")).rejects.toMatchObject({
        to: "/login?next=%2Fcheckout",
      });
    });
  });

  describe("requireAdminForPage", () => {
    it("returns an admin", async () => {
      const admin = await makeUser("admin");
      await startSession(admin.id);

      await expect(requireAdminForPage("/admin")).resolves.toMatchObject({
        role: "admin",
      });
    });

    it("renders not-found for a customer", async () => {
      const customer = await makeUser("customer");
      await startSession(customer.id);

      await expect(requireAdminForPage("/admin")).rejects.toBeInstanceOf(
        NotFoundSignal,
      );
    });

    it("redirects to login when signed out", async () => {
      await expect(requireAdminForPage("/admin")).rejects.toBeInstanceOf(
        RedirectSignal,
      );
    });
  });

  describe("token version (session invalidation)", () => {
    it("invalidates an existing session when the password changes", async () => {
      const user = await makeUser();
      await startSession(user.id);
      const stolen = jar.raw("session")!.value;

      // Change the password through the model, as the profile endpoint does.
      const doc = await UserModel.findById(user.id);
      doc!.password = "a-different-password";
      await doc!.save();

      jar.clear();
      jar.seed("session", stolen);

      await expect(getCurrentUser()).resolves.toBeNull();
    });

    it("keeps a session valid when something else changes", async () => {
      const user = await makeUser();
      await startSession(user.id);

      const doc = await UserModel.findById(user.id);
      doc!.name = "Renamed";
      await doc!.save();

      await expect(getCurrentUser()).resolves.toMatchObject({
        name: "Renamed",
      });
    });

    it("a session started after the change is valid", async () => {
      const user = await makeUser();

      const doc = await UserModel.findById(user.id);
      doc!.password = "a-different-password";
      await doc!.save();

      await startSession(user.id);

      await expect(getCurrentUser()).resolves.toMatchObject({ id: user.id });
    });
  });
});
