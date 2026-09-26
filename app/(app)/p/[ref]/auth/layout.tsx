import { AuthNav } from "@/components/auth/auth-nav";

/**
 * A nav column against the rail, the section beside it.
 *
 * **`h-full`, not `min-h-full`, and the padding lives in the pages.** A minimum height is not a
 * definite one, so a page asking for `h-full` — which a full-bleed table must, to scroll inside
 * itself rather than push the window taller — would resolve against `auto` and fill nothing. The
 * shell's content area is a flex child of an `h-dvh` column, so there is a real height to inherit.
 *
 * Padding moved out for the same reason: a form page wants a 1280px column with 32px around it, and
 * a grid wants both edges. Emails and OAuth Apps ask for it themselves now.
 */
export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;

  return (
    <div className="flex h-full">
      <AuthNav projectRef={ref} />

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
