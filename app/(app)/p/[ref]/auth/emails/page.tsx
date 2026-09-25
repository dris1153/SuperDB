import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { PageHeader } from "@/components/page-header";
import { EmailsPage } from "@/components/auth/emails-page";

export const dynamic = "force-dynamic";

export default async function AuthEmailsPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!(await resolveProject(ref))) notFound();

  return (
    <>
      <PageHeader title="Emails">
        The mail this project sends, and the server it sends through
      </PageHeader>
      <EmailsPage projectRef={ref} />
    </>
  );
}
