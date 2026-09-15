import { SettingsNav } from "@/components/project-settings/settings-nav";

/**
 * The frame every settings section renders inside.
 *
 * A layout rather than tabs, so the Password Manager is a route of its own — which is what lets it be
 * linked to, and what keeps a page that can reset a database password from being one keystroke away
 * from the page that renames a project.
 */
export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl">Project Settings</h1>
        <p className="text-sm text-subtle">General configuration and lifecycle</p>
      </header>

      <div className="flex gap-8">
        <SettingsNav projectRef={ref} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
