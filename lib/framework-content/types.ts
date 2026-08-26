/**
 * Framework quickstart content, transcribed from Supabase's own Connect sheet
 * (apps/studio/components/interfaces/ConnectSheet/content) so the snippets match what their
 * dashboard hands out. Re-check that directory when Supabase ships a client API change.
 */

export type ProjectKeys = {
  apiUrl: string;
  publishableKey: string | null;
  /** The legacy JWT key. Still the only option on projects that predate publishable keys. */
  anonKey: string | null;
};

export type FrameworkFile = { name: string; language: string; code: string };

export type Variant = {
  key: string;
  label: string;
  /** Replaces the framework's packages when this variant needs more of them. */
  packages?: string[];
  files: (keys: ProjectKeys) => FrameworkFile[];
};

export type Framework = {
  key: string;
  label: string;
  /** Export name in `developer-icons`. Null falls back to a lettered tile. */
  icon: string | null;
  /** Optional: Supabase has no quickstart for every framework (Astro, for one). */
  guide?: string;
  packages: string[];
  /** A shadcn registry item. Its presence is what puts the Shadcn toggle on screen. */
  shadcnRegistry?: string;
  variants: Variant[];
};

/** The key variable a framework's own code reads — publishable when the project has one. */
export const keyVar = (prefix: string, keys: ProjectKeys) =>
  `${prefix}_SUPABASE_${keys.publishableKey ? "PUBLISHABLE_KEY" : "ANON_KEY"}`;

/** `PREFIX_SUPABASE_URL` plus the key under whichever name the project's key type implies. */
export function prefixedEnv(name: string, prefix: string, keys: ProjectKeys): FrameworkFile {
  const value = keys.publishableKey ?? keys.anonKey ?? "your-anon-key";
  return {
    name,
    language: "bash",
    code: `${prefix}_SUPABASE_URL=${keys.apiUrl}\n${keyVar(prefix, keys)}=${value}\n`,
  };
}

/** The plainer pair, for frameworks that map env into their own config instead of reading it raw. */
export function plainEnv(name: string, keys: ProjectKeys, prefix = ""): FrameworkFile {
  const p = prefix ? `${prefix}_` : "";
  const value = keys.publishableKey ?? keys.anonKey ?? "your-anon-key";
  return {
    name,
    language: "bash",
    code: `${p}SUPABASE_URL=${keys.apiUrl}\n${p}SUPABASE_KEY=${value}\n`,
  };
}
