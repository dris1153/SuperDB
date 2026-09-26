import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { templateFor } from "@/lib/auth-config";
import { TemplateEditor } from "@/components/auth/template-editor";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  return { title: templateFor((await params).key)?.label ?? "Emails" };
}

export const dynamic = "force-dynamic";

/**
 * One email template.
 *
 * The key is checked against the catalogue before anything else, and an unknown one is a 404. It is
 * a URL segment, and the same lookup is what turns it into a config field name in the save action —
 * a key that is not in `lib/auth-config.ts` must never get as far as naming a field.
 */
export default async function EmailTemplatePage({
  params,
}: {
  params: Promise<{ ref: string; key: string }>;
}) {
  const { ref, key } = await params;
  if (!templateFor(key)) notFound();
  if (!(await resolveProject(ref))) notFound();

  return (
    <div className="mx-auto max-w-5xl p-8">
      <TemplateEditor projectRef={ref} templateKey={key} />
    </div>
  );
}
