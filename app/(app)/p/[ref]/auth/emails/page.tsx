import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { PageHeader } from "@/components/page-header";
import { EmailsPage } from "@/components/auth/emails-page";

export const dynamic = "force-dynamic";

export default async function AuthEmailsPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!(await resolveProject(ref))) notFound();

  return (
    // The container the layout used to provide, narrower than the grids': the original is a column
    // of cards and forms rather than a table.
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <PageHeader title="Emails">
        Configure what emails your users receive and how they are sent
      </PageHeader>
      <EmailsPage projectRef={ref} />
    </div>
  );
}
