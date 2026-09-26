import { SettingsNav } from "@/components/project-settings/settings-nav";

/**
 * The frame every settings section renders inside: the nav panel against the rail, the section beside
 * it.
 *
 * A layout rather than tabs, so the Password Manager is a route of its own — which is what lets it be
 * linked to, and what keeps a page that can reset a database password from being one keystroke away
 * from the page that renames a project.
 *
 * `min-h-full` rather than `h-full`: the project layout's content area already scrolls, and giving
 * this its own scroller would nest one inside the other and put two scrollbars on a long section.
 * The panel's border runs to whichever column is taller, which is what makes it read as a column
 * rather than a card.
 *
 * **No title here.** One heading reading "Project Settings" over every section said nothing about
 * which section you were looking at, while the nav on the left already says you are in settings.
 * Each page titles itself with `PageHeader`.
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
    <div className="flex min-h-full">
      <SettingsNav projectRef={ref} />

      <div className="min-w-0 flex-1">
        {/* `max-w-7xl` like every other project page. At 3xl the JWT keys table did not fit and
            scrolled its own status column out of sight, which is worse than a wide form. */}
        <div className="mx-auto max-w-7xl space-y-8 p-8">{children}</div>
      </div>
    </div>
  );
}
