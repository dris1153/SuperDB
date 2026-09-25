import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { PageHeader } from "@/components/page-header";
import { S3Config } from "@/components/storage/s3-config";

export const dynamic = "force-dynamic";

export default async function S3Page({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();

  // The region comes from the project record rather than from the storage config, which does not
  // carry one.
  return (
    <>
      <PageHeader title="S3 Configuration">
        Connect to your buckets using any S3-compatible service
      </PageHeader>
      <S3Config projectRef={ref} region={found.project.region} />
    </>
  );
}
