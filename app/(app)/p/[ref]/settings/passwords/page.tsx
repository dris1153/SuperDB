import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { projectSecret } from "@/lib/project-secrets";
import { PasswordManager } from "@/components/project-settings/password-manager";

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
  if (!(await resolveProject(ref))) notFound();

  return <PasswordManager projectRef={ref} blob={await projectSecret(ref)} />;
}
