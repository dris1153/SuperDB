/** The app's colours for places CSS variables cannot reach: generated images and the manifest. */
export const BRAND = { green: "#3ecf8e", ink: "#121212", card: "#171717", border: "#2e2e2e" } as const;

/**
 * Tabler's database icon on a tile — the mark the sidebar and the sign-in card draw.
 * Inline styles and plain SVG only: `next/og` renders this, not a browser.
 */
export function BrandTile({
  size,
  radius = Math.round(size * 0.22),
  background = BRAND.ink,
}: {
  size: number;
  radius?: number;
  background?: string;
}) {
  const icon = Math.round(size * 0.66);

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background,
        borderRadius: radius,
      }}
    >
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke={BRAND.green}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6a8 3 0 1 0 16 0a8 3 0 1 0 -16 0" />
        <path d="M4 6v6a8 3 0 0 0 16 0v-6" />
        <path d="M4 12v6a8 3 0 0 0 16 0v-6" />
      </svg>
    </div>
  );
}
