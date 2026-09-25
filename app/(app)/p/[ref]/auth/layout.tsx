import { AuthNav } from "@/components/auth/auth-nav";

/** The frame Storage and Settings use: a nav column against the rail, the section beside it. */
export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;

  return (
    <div className="flex min-h-full">
      <AuthNav projectRef={ref} />

      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl space-y-8 p-8">{children}</div>
      </div>
    </div>
  );
}
