import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { parseCatalogPageParams, parseCatalogQuery } from "./catalog-query";

describe("parseCatalogQuery (API, strict)", () => {
  it("parses every supported parameter", () => {
    const options = parseCatalogQuery(
      new URLSearchParams(
        "page=2&limit=6&search=kettle&category=Audio&minPrice=10&maxPrice=99.5&sort=price-asc",
      ),
    );

    expect(options).toEqual({
      page: 2,
      limit: 6,
      search: "kettle",
      category: "audio",
      minPrice: 10,
      maxPrice: 99.5,
      sort: "price-asc",
    });
  });

  it("treats a blank parameter as not set", () => {
    expect(parseCatalogQuery(new URLSearchParams("search=&sort="))).toEqual({});
  });

  it.each([
    ["page=abc"],
    ["page=0"],
    ["page=1.5"],
    ["limit=-1"],
    ["sort=cheapest"],
    ["minPrice=free"],
    ["maxPrice=-5"],
    ["minPrice=Infinity"],
    ["minPrice=0x10"],
    ["page=1e3"],
    [`search=${"x".repeat(101)}`],
  ])("rejects %s", (query) => {
    expect(() => parseCatalogQuery(new URLSearchParams(query))).toThrow(ZodError);
  });

  it("cannot be talked into showing soft-deleted products", () => {
    const options = parseCatalogQuery(new URLSearchParams("includeInactive=true"));

    expect(options).not.toHaveProperty("includeInactive");
  });
});

describe("parseCatalogPageParams (page, lenient)", () => {
  it("keeps valid values and drops invalid ones", () => {
    expect(
      parseCatalogPageParams({ page: "abc", sort: "cheapest", search: "kettle" }),
    ).toEqual({ search: "kettle" });
  });

  it("ignores limit, which the page's links could not carry", () => {
    expect(parseCatalogPageParams({ limit: "5" })).toEqual({});
  });

  it("cannot be talked into showing soft-deleted products", () => {
    expect(parseCatalogPageParams({ includeInactive: "true" })).toEqual({});
  });

  it("uses the first value of a repeated parameter", () => {
    expect(parseCatalogPageParams({ category: ["audio", "phones"] })).toEqual({
      category: "audio",
    });
  });

  it("drops an inverted price range rather than failing the page", () => {
    expect(parseCatalogPageParams({ minPrice: "100", maxPrice: "5" })).toEqual({});
  });

  it("keeps a valid price range", () => {
    expect(parseCatalogPageParams({ minPrice: "5", maxPrice: "100" })).toEqual({
      minPrice: 5,
      maxPrice: 100,
    });
  });
});
