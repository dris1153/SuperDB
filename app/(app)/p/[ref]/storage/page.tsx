import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { PageHeader } from "@/components/page-header";
import { StorageFiles } from "@/components/storage/storage-files";

export const dynamic = "force-dynamic";

export default async function StoragePage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!(await resolveProject(ref))) notFound();

  return (
    <>
      <PageHeader title="Files">General file storage for most types of digital content</PageHeader>
      <StorageFiles projectRef={ref} />
    </>
  );
}
