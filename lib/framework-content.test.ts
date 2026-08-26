import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  FRAMEWORKS,
  installCommand,
  variantFor,
  type ProjectKeys,
} from "./framework-content/index.ts";

const MODERN: ProjectKeys = {
  apiUrl: "https://abc.supabase.co",
  publishableKey: "sb_publishable_xyz",
  anonKey: "eyJhbGci.legacy",
};

const LEGACY: ProjectKeys = { ...MODERN, publishableKey: null };

test("every variant renders files for both key generations", () => {
  for (const framework of FRAMEWORKS) {
    for (const variant of framework.variants) {
      for (const keys of [MODERN, LEGACY]) {
        const where = `${framework.key}/${variant.key}`;
        const files = variant.files(keys);
        assert.ok(files.length > 0, `${where} produced no files`);

        for (const file of files) {
          assert.ok(file.name, `${where} has an unnamed file`);
          // Catches a template hole far more reliably than reading 12 snippets by eye.
          assert.ok(
            !/undefined|\[object Object\]/.test(file.code),
            `${where} → ${file.name} has an unresolved interpolation`,
          );
        }
      }
    }
  }
});

test("the env file comes first and carries the project's real values", () => {
  for (const framework of FRAMEWORKS) {
    for (const variant of framework.variants) {
      const [env] = variant.files(MODERN);
      const where = `${framework.key}/${variant.key}`;
      assert.match(env.name, /^\.env/, `${where} does not lead with an env file`);
      assert.ok(env.code.includes(MODERN.apiUrl), `${where} env is missing the project URL`);
      assert.ok(
        env.code.includes(MODERN.publishableKey!),
        `${where} env is missing the publishable key`,
      );
    }
  }
});

test("a project without a publishable key falls back to the legacy anon key", () => {
  const nextjs = FRAMEWORKS.find((f) => f.key === "nextjs")!;
  const [env] = variantFor(nextjs, "app").files(LEGACY);
  assert.ok(env.code.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci.legacy"));
  assert.ok(!env.code.includes("PUBLISHABLE"));
});

test("App Router pulls in @supabase/ssr, Pages Router does not", () => {
  const nextjs = FRAMEWORKS.find((f) => f.key === "nextjs")!;
  assert.equal(
    installCommand(nextjs, "app"),
    "npm install @supabase/supabase-js @supabase/ssr",
  );
  assert.equal(installCommand(nextjs, "pages"), "npm install @supabase/supabase-js");
});

test("the shadcn env step reuses the variant's own env file", () => {
  // The panel renders files[0] for that step, so a framework offering shadcn must lead with env.
  for (const framework of FRAMEWORKS.filter((f) => f.shadcnRegistry)) {
    for (const variant of framework.variants) {
      assert.match(variant.files(MODERN)[0].name, /^\.env/, framework.key);
    }
  }
});
