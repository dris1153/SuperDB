import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { PageHeader } from "@/components/page-header";
import { BucketKind } from "@/components/storage/bucket-kind";

export const metadata: Metadata = { title: "Vectors" };

export const dynamic = "force-dynamic";

export default async function VectorsPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!(await resolveProject(ref))) notFound();

  return (
    <>
      <PageHeader title="Vectors">Purpose-built storage for vector data</PageHeader>
      <BucketKind
        projectRef={ref}
        title="Vectors"
        blurb="Store, index, and query your vector embeddings at scale."
        intro="Vector buckets are in private alpha. Expect rapid changes, limited features, and possible breaking updates."
        feature="vectorBuckets"
      />
    </>
  );
}
