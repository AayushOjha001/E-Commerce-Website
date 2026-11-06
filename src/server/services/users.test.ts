import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { UserModel } from "@/server/models";
import {
  MIN_PASSWORD_LENGTH,
  createUser,
  findUserForLogin,
  getUserById,
  registerCustomer,
  requireUserById,
  toPublicUser,
  updateUserProfile,
} from "./users";
import {
  clearDatabase,
  dbReachable,
  requireDb,
  setupTestDatabase,
  teardownTestDatabase,
} from "@/test/db";

describe("database availability", () => {
  it.runIf(requireDb)("is reachable, because REQUIRE_DB=1", () => {
    expect(dbReachable).toBe(true);
  });
});

describe.skipIf(!dbReachable)("users service", () => {
  beforeAll(setupTestDatabase);
  afterAll(teardownTestDatabase);
  beforeEach(clearDatabase);

  const input = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "secret-password",
  };

  describe("createUser", () => {
    it("creates a customer and never returns the password", async () => {
      const user = await createUser(input);

      expect(user).toMatchObject({
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "customer",
      });
      expect(user).not.toHaveProperty("password");
      expect(JSON.stringify(user)).not.toMatch(/secret-password/);
    });

    it("hashes the password", async () => {
      await createUser(input);

      const stored = await UserModel.findOne({ email: input.email }).select(
        "+password",
      );

      expect(stored!.password).not.toBe(input.password);
      expect(stored!.password).toMatch(/^\$2[aby]\$/);
    });

    it("normalises email and trims the name", async () => {
      const user = await createUser({
        ...input,
        email: "  ADA@Example.COM  ",
        name: "  Ada  ",
      });

      expect(user.email).toBe("ada@example.com");
      expect(user.name).toBe("Ada");
    });

    it("rejects a duplicate email with a conflict", async () => {
      await createUser(input);

      await expect(createUser(input)).rejects.toMatchObject({
        code: "conflict",
      });
    });

    it("treats a differently-cased duplicate as a duplicate", async () => {
      await createUser(input);

      await expect(
        createUser({ ...input, email: "ADA@EXAMPLE.COM" }),
      ).rejects.toMatchObject({ code: "conflict" });
    });

    it("can create an admin when asked explicitly", async () => {
      const admin = await createUser({ ...input, role: "admin" });

      expect(admin.role).toBe("admin");
    });

    it("defaults to customer, so registration cannot self-elevate", async () => {
      const user = await createUser(input);

      expect(user.role).toBe("customer");
    });
  });

  describe("password policy", () => {
    it("rejects a password shorter than the minimum", async () => {
      await expect(
        createUser({ ...input, password: "a".repeat(MIN_PASSWORD_LENGTH - 1) }),
      ).rejects.toMatchObject({ code: "validation" });
    });

    it("accepts a password at the minimum length", async () => {
      await expect(
        createUser({ ...input, password: "a".repeat(MIN_PASSWORD_LENGTH) }),
      ).resolves.toMatchObject({ email: input.email });
    });

    it("applies on profile update too", async () => {
      const created = await createUser(input);

      await expect(
        updateUserProfile(created.id, { password: "short" }),
      ).rejects.toMatchObject({ code: "validation" });
    });
  });

  describe("registerCustomer", () => {
    it("always creates a customer, so registration cannot self-elevate", async () => {
      const user = await registerCustomer(input);

      expect(user.role).toBe("customer");
    });

    it("ignores a role smuggled in by a caller spreading a request body", async () => {
      // The type forbids `role` here; this simulates an untyped handler doing
      // registerCustomer({ ...body }) with role: "admin" in the body.
      const smuggled = { ...input, role: "admin" } as Parameters<
        typeof registerCustomer
      >[0];

      const user = await registerCustomer(smuggled);

      expect(user.role).toBe("customer");
    });
  });

  describe("findUserForLogin", () => {
    it("returns a document with the password hash selected", async () => {
      await createUser(input);

      const user = await findUserForLogin(input.email);

      expect(user).not.toBeNull();
      expect(user!.password).toBeTruthy();
      await expect(user!.matchPassword(input.password)).resolves.toBe(true);
      await expect(user!.matchPassword("wrong")).resolves.toBe(false);
    });

    it("is case- and whitespace-insensitive on email", async () => {
      await createUser(input);

      await expect(findUserForLogin("  ADA@EXAMPLE.COM ")).resolves.not.toBeNull();
    });

    it("returns null for an unknown email", async () => {
      await expect(findUserForLogin("nobody@example.com")).resolves.toBeNull();
    });
  });

  describe("getUserById", () => {
    it("returns the public shape", async () => {
      const created = await createUser(input);

      const user = await getUserById(created.id);

      expect(user).toMatchObject({ id: created.id, email: input.email });
      expect(user).not.toHaveProperty("password");
    });

    it("returns null for a missing or malformed id", async () => {
      await expect(getUserById(String(new Types.ObjectId()))).resolves.toBeNull();
      await expect(getUserById("not-an-id")).resolves.toBeNull();
    });
  });

  describe("requireUserById", () => {
    it("throws not_found instead of returning null", async () => {
      await expect(
        requireUserById(String(new Types.ObjectId())),
      ).rejects.toMatchObject({ code: "not_found" });
    });
  });

  describe("updateUserProfile", () => {
    it("updates the name", async () => {
      const created = await createUser(input);

      const updated = await updateUserProfile(created.id, { name: "Ada L." });

      expect(updated.name).toBe("Ada L.");
    });

    it("re-hashes a changed password and keeps login working", async () => {
      const created = await createUser(input);

      await updateUserProfile(created.id, { password: "brand-new-password" });

      const user = await findUserForLogin(input.email);
      await expect(user!.matchPassword("brand-new-password")).resolves.toBe(true);
      await expect(user!.matchPassword(input.password)).resolves.toBe(false);
    });

    it("does not break login when only the name changes (audit B9)", async () => {
      const created = await createUser(input);

      await updateUserProfile(created.id, { name: "Renamed" });

      const user = await findUserForLogin(input.email);
      await expect(user!.matchPassword(input.password)).resolves.toBe(true);
    });

    it("rejects an email already taken by someone else", async () => {
      await createUser(input);
      const other = await createUser({
        ...input,
        email: "grace@example.com",
      });

      await expect(
        updateUserProfile(other.id, { email: "ada@example.com" }),
      ).rejects.toMatchObject({ code: "conflict" });
    });

    it("allows setting the same email again", async () => {
      const created = await createUser(input);

      const updated = await updateUserProfile(created.id, {
        email: "ADA@example.com",
      });

      expect(updated.email).toBe("ada@example.com");
    });

    it("cannot change the role — privilege escalation is not self-service", async () => {
      const created = await createUser(input);

      await updateUserProfile(created.id, {
        // `role` is not part of UpdateProfileInput; passing it must be inert.
        name: "Ada",
        ...({ role: "admin" } as Record<string, unknown>),
      });

      const after = await getUserById(created.id);
      expect(after!.role).toBe("customer");
    });

    it("throws not_found for a missing or malformed id", async () => {
      await expect(
        updateUserProfile(String(new Types.ObjectId()), { name: "X" }),
      ).rejects.toMatchObject({ code: "not_found" });
      await expect(
        updateUserProfile("garbage", { name: "X" }),
      ).rejects.toMatchObject({ code: "not_found" });
    });
  });

  describe("toPublicUser", () => {
    it("exposes only safe fields", async () => {
      const stored = await UserModel.create(input);

      const publicUser = toPublicUser(stored);

      expect(Object.keys(publicUser).sort()).toEqual([
        "createdAt",
        "email",
        "id",
        "name",
        "role",
      ]);
    });
  });
});
