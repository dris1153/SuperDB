import { StorageNav } from "@/components/storage/storage-nav";

/**
 * The same frame the settings section uses: a nav column against the rail, the section beside it.
 *
 * `min-h-full` rather than `h-full`, and `max-w-7xl` like every other project page — the file
 * browser in a later phase is the widest thing in the app.
 */
export default async function StorageLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;

  return (
    <div className="flex min-h-full">
      <StorageNav projectRef={ref} />

      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl space-y-8 p-8">{children}</div>
      </div>
    </div>
  );
}
