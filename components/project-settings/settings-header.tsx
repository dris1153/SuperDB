/**
 * The title of one settings section.
 *
 * Lives in each page rather than in the layout, because "Project Settings" over every section said
 * nothing about which section you were looking at — the nav on the left already says you are in
 * settings.
 */
export function SettingsHeader({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <header className="space-y-1">
      <h1 className="text-2xl">{title}</h1>
      <p className="text-sm text-subtle">{children}</p>
    </header>
  );
}
