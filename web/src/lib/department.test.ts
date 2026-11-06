import { describe, expect, it } from "vitest";

import { DEPARTMENT_FIELDS, departmentClass, departmentField } from "./department";

describe("departmentField", () => {
  it("gives each seeded department its own field", () => {
    const slugs = ["audio", "computers", "phones", "home-kitchen", "wearables"];
    const fields = slugs.map(departmentField);

    expect(new Set(fields).size).toBe(slugs.length);
  });

  it("gives an unknown category a stable field from the same palette", () => {
    const first = departmentField("garden-tools");

    expect(departmentField("garden-tools")).toBe(first);
    expect(Object.keys(DEPARTMENT_FIELDS)).toContain(first);
  });

  it("spreads unknown categories across the palette", () => {
    const fields = new Set(
      ["garden", "tools", "toys", "books", "games", "paint", "bikes", "tents"].map(
        departmentField,
      ),
    );

    expect(fields.size).toBeGreaterThan(1);
  });

  it.each(["constructor", "__proto__", "toString"])(
    "gives %s a real field, not an inherited property",
    (slug) => {
      expect(Object.keys(DEPARTMENT_FIELDS)).toContain(departmentField(slug));
      expect(departmentClass(slug)).toMatch(/^bg-/);
    },
  );

  it("falls back when a product has lost its category", () => {
    expect(departmentField(null)).toBe("sky");
    expect(departmentField(undefined)).toBe("sky");
  });
});

describe("departmentClass", () => {
  it("returns a class Tailwind can see in source", () => {
    expect(departmentClass("audio")).toBe("bg-marigold");
  });
});
