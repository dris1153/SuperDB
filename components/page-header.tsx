/**
 * The title of one section of a project.
 *
 * Lives in each page rather than in a layout: "Project Settings" over every settings section said
 * nothing about which section you were looking at, and Storage has the same shape of sub-navigation
 * with the same need.
 */
export function PageHeader({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <header className="space-y-1">
      <h1 className="text-2xl">{title}</h1>
      <p className="text-sm text-subtle">{children}</p>
    </header>
  );
}
