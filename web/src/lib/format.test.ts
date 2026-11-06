import { describe, expect, it } from "vitest";

import { formatDate, formatPrice, pluralise } from "./format";

describe("formatPrice", () => {
  it("always shows cents", () => {
    expect(formatPrice(149)).toBe("$149.00");
    expect(formatPrice(89.5)).toBe("$89.50");
  });

  it("groups thousands", () => {
    expect(formatPrice(1299)).toBe("$1,299.00");
  });
});

describe("formatDate", () => {
  it("does not shift the day with the machine's time zone", () => {
    expect(formatDate("2026-03-01T00:30:00.000Z")).toBe("Mar 1, 2026");
  });
});

describe("pluralise", () => {
  it("handles one, many and irregular plurals", () => {
    expect(pluralise(1, "product")).toBe("1 product");
    expect(pluralise(3, "product")).toBe("3 products");
    expect(pluralise(0, "category", "categories")).toBe("0 categories");
  });
});
