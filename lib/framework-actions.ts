"use server";

import {
  frameworkFor,
  installCommand,
  variantFor,
  type ProjectKeys,
} from "./framework-content";
import { buildPrompt, command, render, skillsStep, type GuideStep } from "./guide-steps";
import { resolveProject } from "./inventory";
import { listApiKeys } from "./mgmt-api";
import { attempt } from "./safe";

export type ProjectKeysResult =
  | { blocked: true; reason: string }
  | { blocked: false; keys: ProjectKeys };

export type FrameworkGuide = { steps: GuideStep[]; prompt: string };

/**
 * Fetched once per project, not once per selection: the keys belong to the project and every
 * framework renders the same pair. Folding this into the guide call meant a Management API request
 * on every dropdown change, which is latency the user sees and rate limit they do not.
 *
 * reveal=false is deliberate. Supabase returns every key's value either way, but this panel only
 * needs the publishable one, so the secret is dropped here instead of travelling to the browser.
 */
export async function getProjectKeys(projectRef: string): Promise<ProjectKeysResult> {
  const found = await resolveProject(projectRef);
  if (!found) return { blocked: true, reason: "Project not found." };

  const result = await attempt(() => listApiKeys(found.token, projectRef));
  if (!result.ok) return { blocked: true, reason: result.reason };

  return {
    blocked: false,
    keys: {
      apiUrl: `https://${projectRef}.supabase.co`,
      publishableKey: result.data.find((k) => k.type === "publishable")?.api_key ?? null,
      anonKey: result.data.find((k) => k.name === "anon")?.api_key ?? null,
    },
  };
}

/**
 * Pure apart from syntax highlighting, which is the only reason this runs on the server at all —
 * Shiki's grammars would otherwise have to ship to every visitor.
 *
 * Taking keys as an argument rather than re-reading them is safe: they are already on the page, in
 * the snippets this returns, and nothing here reads project data or grants anything.
 */
export async function buildFrameworkGuide(
  keys: ProjectKeys,
  frameworkKey: string,
  variantKey: string | null,
  shadcn: boolean,
): Promise<FrameworkGuide> {
  const framework = frameworkFor(frameworkKey);
  if (!framework) return { steps: [], prompt: "" };

  const variant = variantFor(framework, variantKey);
  const files = variant.files(keys);

  const steps: GuideStep[] = [
    {
      title: "Install package",
      description: "Run this command to install the required dependencies.",
      files: [await command(installCommand(framework, variantKey))],
    },
  ];

  if (shadcn && framework.shadcnRegistry) {
    steps.push({
      title: "Add Supabase Library blocks",
      description: "Install Supabase Library blocks via the shadcn registry.",
      files: [await command(`npx shadcn@latest add ${framework.shadcnRegistry}`)],
      link: { text: "supabase.com/library", href: "https://supabase.com/library" },
    });
    steps.push({
      title: "Set env variables",
      description: "Add the following values to your env file.",
      files: [await render(files[0])],
    });
  } else {
    const hasMiddleware = files.some((f) => f.name.includes("middleware"));
    steps.push({
      title: "Add files",
      description: hasMiddleware
        ? "Add env variables, create Supabase client helpers, and set up middleware to keep sessions refreshed."
        : "Add env variables and create the Supabase client helper.",
      files: await Promise.all(files.map(render)),
    });
  }

  steps.push(await skillsStep());

  const label =
    framework.variants.length > 1 ? `${framework.label} (${variant.label})` : framework.label;

  return { steps, prompt: buildPrompt(label, steps) };
}
