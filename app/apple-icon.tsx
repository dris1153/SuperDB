import { ImageResponse } from "next/og";
import { BrandTile } from "@/components/brand-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Square corners: iOS rounds the tile itself, and a rounded source would show its own corners inside.
export default function AppleIcon() {
  return new ImageResponse(<BrandTile size={180} radius={0} />, size);
}
