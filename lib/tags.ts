/**
 * Trimmed, lower-cased, de-duplicated, order preserved.
 *
 * Without this, "Prod", "prod " and "prod" become three tags that look identical in the picker and
 * filter differently — the exact failure a free-text tag field invites.
 */
export const normaliseTags = (tags: string[]): string[] => [
  ...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
];
