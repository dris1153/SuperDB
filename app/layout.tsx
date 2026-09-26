import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-jetbrains" });

const description = "Every Supabase project, every account, on one board.";

// Icons, the preview image and the manifest come from the metadata files beside this one.
export const metadata: Metadata = {
  metadataBase: new URL("https://database.drisdev.io"),
  title: { template: "%s | SuperDB", default: "SuperDB" },
  description,
  applicationName: "SuperDB",
  // A signed-in dashboard. Link previews ignore this; search engines should not list the sign-in page.
  robots: { index: false, follow: false },
  openGraph: { type: "website", siteName: "SuperDB", title: "SuperDB", description },
  twitter: { card: "summary_large_image", title: "SuperDB", description },
};

export const viewport: Viewport = { themeColor: "#121212", colorScheme: "dark" };

// Dark-only: the palette lives in :root, and the `dark` class is here so `dark:` variants inside
// shadcn components resolve against it.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
