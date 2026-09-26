import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { OAuthServerPage } from "@/components/auth/oauth-server-settings";

export const metadata: Metadata = { title: "OAuth Server" };

export const dynamic = "force-dynamic";

export default async function AuthOAuthServerPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!(await resolveProject(ref))) notFound();

  return <OAuthServerPage projectRef={ref} />;
}
