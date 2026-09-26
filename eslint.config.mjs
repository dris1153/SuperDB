import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

/**
 * Linting was never actually set up here: `next lint` bootstrapped ESLint on demand, and Next 16
 * removed it, leaving a script that only looked like it worked. This is the CLI setup its docs point
 * at — `node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md`.
 *
 * `eslint-config-next/typescript` is deliberately not included: it mostly overlaps with what
 * `tsc --strict` already enforces cleanly, and the rest is style opinion this repo does not want.
 */
export default defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      // Promoted from the config's default `warn`. This is the rule that would have caught the stale
      // closure in the table editor's column memo, and a warning nobody reads is not a check.
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    /**
     * `react-hooks/purity` models a client component that re-renders. It does not know about async
     * Server Components, where `Date.now()` runs once per request and is the correct thing to write.
     *
     * Every file under `app/` is a Server Component in this project — there is no `"use client"`
     * anywhere in it. `service-usage.tsx` is the one async Server Component living in `components/`;
     * if more appear they go on this list, where they stay visible.
     */
    files: ["app/**/*.tsx", "components/service-usage.tsx"],
    rules: { "react-hooks/purity": "off" },
  },
]);
