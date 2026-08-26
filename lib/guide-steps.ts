import { highlight, type Lang } from "./highlight";

/** The shape every content module produces, before highlighting. */
export type SourceFile = { name: string; language: string; code: string };

export type GuideFile = { name: string; code: string; html: string | null };

export type GuideStep = {
  title: string;
  optional?: boolean;
  description: string;
  files: GuideFile[];
  link?: { text: string; href: string };
};

/** Supabase labels its snippets with its own language names; Shiki wants its grammar ids. */
const SHIKI: Record<string, Lang> = {
  bash: "bash",
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  html: "html",
};

export const AGENT_SKILLS = "npx skills add supabase/agent-skills";

export const SKILLS_DESCRIPTION =
  "Agent Skills give AI coding tools ready-made instructions, scripts, and resources for working with Supabase more accurately and efficiently.";

export async function render(file: SourceFile): Promise<GuideFile> {
  return {
    name: file.name,
    code: file.code,
    html: await highlight(file.code, SHIKI[file.language] ?? "bash"),
  };
}

/** A bare command block — no filename, so the panel stacks it instead of putting it behind a tab. */
export const command = (code: string) => render({ name: "", language: "bash", code });

export function buildPrompt(label: string, steps: GuideStep[]): string {
  const body = steps
    .filter((step) => !step.optional)
    .map((step) => {
      const blocks = step.files
        .map((f) => `${f.name ? `${f.name}\n` : ""}\`\`\`\n${f.code}\n\`\`\``)
        .join("\n\n");
      return `## ${step.title}\n${step.description}\n\n${blocks}`;
    })
    .join("\n\n");
  return `Set up Supabase in my ${label} project.\n\n${body}`;
}

/** Closes every guide; identical wherever it appears. */
export const skillsStep = async (): Promise<GuideStep> => ({
  title: "Install Agent Skills",
  optional: true,
  description: SKILLS_DESCRIPTION,
  files: [await command(AGENT_SKILLS)],
});
