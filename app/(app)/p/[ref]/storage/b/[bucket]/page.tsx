import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { FileBrowser } from "@/components/storage/file-browser";

export const dynamic = "force-dynamic";

export default async function BucketPage({
  params,
}: {
  params: Promise<{ ref: string; bucket: string }>;
}) {
  const { ref, bucket } = await params;
  if (!(await resolveProject(ref))) notFound();

  // Not decoded again: Next percent-decodes dynamic params before handing them over. Decoding twice
  // turns a bucket named `my%20bucket` into `my bucket` — a different bucket, silently — and throws
  // URIError on a name containing a bare `%`, which is an uncaught 500 from a crafted URL.
  return <FileBrowser projectRef={ref} bucket={bucket} />;
}
