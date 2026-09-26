import type { MetadataRoute } from "next";
import { BRAND } from "@/components/brand-mark";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SuperDB",
    short_name: "SuperDB",
    description: "Every Supabase project, every account, on one board.",
    start_url: "/",
    display: "standalone",
    background_color: BRAND.ink,
    theme_color: BRAND.ink,
    // The routes `app/icon.tsx` generates, one per id.
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
    ],
  };
}
