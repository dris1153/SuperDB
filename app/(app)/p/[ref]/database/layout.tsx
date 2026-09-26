import { DatabaseNav } from "@/components/project-database/database-nav";

/** The nav against the rail, the page beside it. `h-full` so the canvas can fill it; pages pad themselves. */
export default async function DatabaseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;

  return (
    <div className="flex h-full">
      <DatabaseNav projectRef={ref} />

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
