import { describe, expect, it } from "vitest";

import { catalogHref, paginationWindow } from "./catalog-url";

describe("catalogHref", () => {
  it("returns the bare path with no filters", () => {
    expect(catalogHref({})).toBe("/products");
  });

  it("keeps the current filters when one changes", () => {
    expect(
      catalogHref({ search: "kettle", sort: "price-asc" }, { category: "audio" }),
    ).toBe("/products?search=kettle&category=audio&sort=price-asc");
  });

  it("drops the page when a filter changes", () => {
    expect(catalogHref({ page: 3, search: "a" }, { category: "audio" })).toBe(
      "/products?search=a&category=audio",
    );
  });

  it("keeps the page when the page is what changes", () => {
    expect(catalogHref({ search: "a" }, { page: 2 })).toBe(
      "/products?search=a&page=2",
    );
  });

  it("clears a filter set to undefined", () => {
    expect(catalogHref({ category: "audio" }, { category: undefined })).toBe(
      "/products",
    );
  });

  it("encodes search text", () => {
    expect(catalogHref({ search: "a&b c" })).toBe("/products?search=a%26b+c");
  });
});

describe("paginationWindow", () => {
  it("shows every page when there are few", () => {
    expect(paginationWindow(2, 3)).toEqual([1, 2, 3]);
  });

  it("marks gaps on both sides", () => {
    expect(paginationWindow(5, 9)).toEqual([1, null, 4, 5, 6, null, 9]);
  });

  it("does not invent pages past either end", () => {
    expect(paginationWindow(1, 5)).toEqual([1, 2, null, 5]);
    expect(paginationWindow(5, 5)).toEqual([1, null, 4, 5]);
  });
});
