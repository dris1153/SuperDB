import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { PageHeader } from "@/components/page-header";
import { BucketKind } from "@/components/storage/bucket-kind";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!(await resolveProject(ref))) notFound();

  return (
    <>
      <PageHeader title="Analytics">Purpose-built storage for analytical workloads</PageHeader>
      <BucketKind
        projectRef={ref}
        title="Analytics"
        blurb="Store large datasets for analytics and reporting."
        intro="Analytics buckets are in private alpha. Expect rapid changes, limited features, and possible breaking updates."
        feature="icebergCatalog"
      />
    </>
  );
}
