import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { PageHeader } from "@/components/page-header";
import { UsersTable } from "@/components/auth/users-table";

export const dynamic = "force-dynamic";

export default async function AuthUsersPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!(await resolveProject(ref))) notFound();

  return (
    <>
      <PageHeader title="Users">Manage the users who can sign in to this project</PageHeader>
      <UsersTable projectRef={ref} />
    </>
  );
}
