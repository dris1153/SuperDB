import { ImageResponse } from "next/og";
import { BrandTile } from "@/components/brand-mark";

// 32 for the tab; 192 and 512 are what the manifest needs for an install.
const SIZES = [32, 192, 512];

export function generateImageMetadata() {
  return SIZES.map((size) => ({ id: String(size), size: { width: size, height: size }, contentType: "image/png" }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const size = Number(await id);
  return new ImageResponse(<BrandTile size={size} />, { width: size, height: size });
}
