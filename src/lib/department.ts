/**
 * Maps a category to its colour field.
 *
 * Colour encodes the department everywhere in the shop (docs/agent/DESIGN.md).
 * The class names are written out in full because Tailwind finds them by
 * scanning source text, so a class assembled at runtime would never be generated.
 */

export const DEPARTMENT_FIELDS = {
  marigold: "bg-marigold",
  sky: "bg-sky",
  coral: "bg-coral",
  mint: "bg-mint",
  lilac: "bg-lilac",
} as const;

export type DepartmentField = keyof typeof DEPARTMENT_FIELDS;

const FIELD_NAMES = Object.keys(DEPARTMENT_FIELDS) as DepartmentField[];

// A Map, not an object: a category an admin names "Constructor" gets the slug
// `constructor`, which on a plain object finds Object.prototype's own property.
const FIELD_BY_SLUG = new Map<string, DepartmentField>([
  ["audio", "marigold"],
  ["computers", "sky"],
  ["phones", "coral"],
  ["home-kitchen", "mint"],
  ["wearables", "lilac"],
]);

/**
 * The field for a category slug.
 *
 * A category an admin adds later still needs a colour, so unknown slugs hash
 * onto the same five fields. The hash keeps a category's colour stable between
 * renders, which picking by list position would not.
 */
export function departmentField(slug: string | null | undefined): DepartmentField {
  if (!slug) return "sky";

  const known = FIELD_BY_SLUG.get(slug);
  if (known) return known;

  let hash = 0;
  for (const char of slug) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return FIELD_NAMES[Math.abs(hash) % FIELD_NAMES.length];
}

export function departmentClass(slug: string | null | undefined): string {
  return DEPARTMENT_FIELDS[departmentField(slug)];
}
