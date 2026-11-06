import { describe, expect, it } from "vitest";

import { formatDate, formatPrice, formatPriceInText, pluralise } from "./format";

describe("formatPrice", () => {
  it("always shows cents", () => {
    expect(formatPrice(149)).toBe("$149.00");
    expect(formatPrice(89.5)).toBe("$89.50");
  });

  it("groups thousands", () => {
    expect(formatPrice(1299)).toBe("$1,299.00");
  });
});

describe("formatPriceInText", () => {
  it("drops cents only when there are none", () => {
    expect(formatPriceInText(100)).toBe("$100");
    expect(formatPriceInText(9.99)).toBe("$9.99");
  });
});

describe("formatDate", () => {
  it("does not shift the day with the machine's time zone", () => {
    // Both ends of the day, so this fails in a zone on either side of UTC.
    expect(formatDate("2026-03-01T00:30:00.000Z")).toBe("Mar 1, 2026");
    expect(formatDate("2026-03-01T23:30:00.000Z")).toBe("Mar 1, 2026");
  });
});

describe("pluralise", () => {
  it("handles one, many and irregular plurals", () => {
    expect(pluralise(1, "product")).toBe("1 product");
    expect(pluralise(3, "product")).toBe("3 products");
    expect(pluralise(0, "category", "categories")).toBe("0 categories");
  });
});
