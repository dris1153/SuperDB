/**
 * A leaf module on purpose. inventory.ts imports project-order.ts, which needs this to validate —
 * keeping it in inventory.ts made those two import each other. That cycle happened to be harmless,
 * because neither reads the other during module evaluation, but it is one top-level reference away
 * from breaking on entry order. Cheaper to remove than to keep verifying.
 */

/** Project refs are 20 lowercase letters — validate before one reaches a URL or a query we build. */
export const isProjectRef = (ref: string) => /^[a-z]{20}$/.test(ref);
