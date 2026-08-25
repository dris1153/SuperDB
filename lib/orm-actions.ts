"use server";

import { buildPrompt, command, render, skillsStep, type GuideStep } from "./guide-steps";
import { ormFor, type PoolerStrings } from "./orm-content";

export type OrmGuide =
  | { blocked: true; reason: string }
  | { blocked: false; steps: GuideStep[]; prompt: string };

/**
 * No Management API call: an ORM needs connection strings, and the page already has them. Shiki is
 * the only reason this crosses to the server at all.
 */
export async function buildOrmGuide(
  pooler: Partial<PoolerStrings>,
  ormKey: string,
): Promise<OrmGuide> {
  const orm = ormFor(ormKey);
  if (!orm) return { blocked: true, reason: "Unknown ORM." };

  if (!pooler.transaction || !pooler.session) {
    return {
      blocked: true,
      reason: "Connection pooler details are unavailable for this project.",
    };
  }

  const steps: GuideStep[] = [
    {
      title: "Install ORM",
      description: "Add the ORM to your project.",
      files: await Promise.all(orm.install.map(command)),
    },
    {
      title: "Configure ORM",
      description: "Set up your ORM configuration.",
      files: await Promise.all(
        orm.files({ transaction: pooler.transaction, session: pooler.session }).map(render),
      ),
    },
    await skillsStep(),
  ];

  return { blocked: false, steps, prompt: buildPrompt(orm.label, steps) };
}
