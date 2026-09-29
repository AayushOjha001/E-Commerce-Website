import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  conflict,
  forbidden,
  notFound,
  outOfStock,
  validationFailed,
} from "@/server/services/errors";
import { toErrorResponse, withErrorHandling } from "./respond";

describe("toErrorResponse", () => {
  it.each([
    [notFound("Product"), 404],
    [validationFailed("Bad input"), 400],
    [conflict("Already exists"), 409],
    [forbidden(), 403],
    [outOfStock("Widget", 2), 409],
  ])("maps %s to the right status", async (error, status) => {
    const response = toErrorResponse(error);

    expect(response.status).toBe(status);
    expect((await response.json()).message).toBeTruthy();
  });

  it("includes field details for a validation failure", async () => {
    const response = toErrorResponse(
      validationFailed("Bad input", { email: "required" }),
    );

    expect((await response.json()).details).toEqual({ email: "required" });
  });

  it("turns a ZodError into a 400 with per-field messages", async () => {
    const schema = z.object({ email: z.string().email(), age: z.number() });
    const parsed = schema.safeParse({ email: "nope", age: "x" });

    const response = toErrorResponse(parsed.error);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(Object.keys(body.details).sort()).toEqual(["age", "email"]);
  });

  it("returns a bare 500 for an unknown error, leaking nothing (audit B6)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const secret = new Error(
      "connect ECONNREFUSED at C:/Study/Programming/secret/db.ts:42",
    );
    const response = toErrorResponse(secret);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text).message).toBe("Something went wrong");
    // None of the original detail may reach the client.
    expect(text).not.toMatch(/ECONNREFUSED/);
    expect(text).not.toMatch(/C:\//);
    expect(text).not.toMatch(/\.ts:\d+/);
    // It still reaches the operator, via the server log.
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });

  it("always answers with JSON, never an HTML error page", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    for (const error of [notFound("X"), new Error("boom"), "a string", null]) {
      const response = toErrorResponse(error);

      expect(response.headers.get("content-type")).toMatch(/application\/json/);
      const text = await response.text();
      expect(text).not.toMatch(/<!DOCTYPE|<html/i);
      expect(JSON.parse(text)).toHaveProperty("message");
    }

    spy.mockRestore();
  });
});

describe("withErrorHandling", () => {
  it("passes a successful response through untouched", async () => {
    const handler = withErrorHandling(async () =>
      Response.json({ ok: true }) as never,
    );

    expect((await handler()).status).toBe(200);
  });

  it("catches a thrown ServiceError", async () => {
    const handler = withErrorHandling(async () => {
      throw notFound("Order");
    });

    expect((await handler()).status).toBe(404);
  });

  it("catches a rejected promise, not just a synchronous throw", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const handler = withErrorHandling(async () => {
      await Promise.resolve();
      throw new Error("async boom");
    });

    expect((await handler()).status).toBe(500);
    spy.mockRestore();
  });

  it("forwards handler arguments", async () => {
    const handler = withErrorHandling(async (request: Request) =>
      Response.json({ url: request.url }) as never,
    );

    const response = await handler(new Request("http://localhost/x"));

    expect((await response.json()).url).toBe("http://localhost/x");
  });
});
