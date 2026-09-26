import { ImageResponse } from "next/og";
import { BRAND, BrandTile } from "@/components/brand-mark";

export const alt = "SuperDB — every Supabase project, every account, on one board.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 96,
          background: BRAND.ink,
          backgroundImage: "radial-gradient(circle at 88% 12%, rgba(62, 207, 142, 0.16), transparent 50%)",
          color: "#fafafa",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div style={{ display: "flex", border: `2px solid ${BRAND.border}`, borderRadius: 28 }}>
            <BrandTile size={120} radius={26} background={BRAND.card} />
          </div>
          <div style={{ fontSize: 96, letterSpacing: -2 }}>SuperDB</div>
        </div>
        <div style={{ marginTop: 44, fontSize: 38, color: "#b4b4b4" }}>
          Every Supabase project, every account, on one board.
        </div>
      </div>
    ),
    size,
  );
}
