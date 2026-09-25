import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { projectSecret } from "@/lib/project-secrets";
import { PasswordManager } from "@/components/project-settings/password-manager";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

/**
 * The blob is read here and handed down as a prop — the same shape the connection credentials form
 * uses. It is ciphertext the server cannot read, so passing it to a client component exposes nothing
 * that was not already sitting in this app's database.
 */
export default async function PasswordManagerPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();

  // The name is what the reset confirm asks the user to type, so it comes from the same resolve that
  // proved they own the project rather than from anything the browser could supply.
  return (
    <>
      <PageHeader title="Password Manager">
        The database password for this project, and how to replace it
      </PageHeader>

      <PasswordManager
        projectRef={ref}
        projectName={found.project.name}
        blob={await projectSecret(ref)}
      />
    </>
  );
}
