/** The app's colours for places CSS variables cannot reach: generated images and the manifest. */
export const BRAND = { green: "#3ecf8e", ink: "#121212", card: "#171717", border: "#2e2e2e" } as const;

// Four database discs on one board, one of them filled — redrawn as vectors from the generated
// logo so it stays sharp at 16px. Outline centreline rx 4.2 / ry 2.15 under a 1.2 stroke, which
// puts the filled disc's outer edge (rx 4.8 / ry 2.75) exactly where the outlined ones' is.
const RX = 4.2;
const RY = 2.15;
const DROP = 3.86;
const CELLS = [
  { cx: 6.8, top: 5.15 },
  { cx: 17.2, top: 5.15 },
  { cx: 6.8, top: 15.01 },
  { cx: 17.2, top: 15.01 },
];

/**
 * The logo mark. Plain SVG with explicit colours, because `next/og` renders it for the icons and
 * the link preview as well as the browser for the sidebar.
 */
export function BrandMark({ size, color = BRAND.green }: { size: number; color?: string }) {
  const [filled, ...outlined] = CELLS;
  const L = filled.cx - RX - 0.6;
  const R = filled.cx + RX + 0.6;
  const bottom = filled.top + DROP;

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <ellipse cx={filled.cx} cy={filled.top} rx={RX + 0.6} ry={RY + 0.6} fill={color} />
      <path
        d={`M${L} ${filled.top + 1.2} A4.8 2.75 0 0 0 ${R} ${filled.top + 1.2} V${bottom} A4.8 2.75 0 0 1 ${L} ${bottom} Z`}
        fill={color}
      />
      {outlined.map(({ cx, top }) => (
        <g key={`${cx}-${top}`} stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx={cx} cy={top} rx={RX} ry={RY} />
          <path d={`M${cx - RX} ${top} v${DROP} a${RX} ${RY} 0 0 0 ${2 * RX} 0 v${-DROP}`} />
        </g>
      ))}
    </svg>
  );
}

/** The mark on a tile, for the icons and the link preview. */
export function BrandTile({
  size,
  radius = Math.round(size * 0.22),
  background = BRAND.ink,
}: {
  size: number;
  radius?: number;
  background?: string;
}) {
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
      <BrandMark size={Math.round(size * 0.72)} />
    </div>
  );
}
