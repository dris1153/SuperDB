import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { UrlConfigurationPage } from "@/components/auth/url-configuration";

export const metadata: Metadata = { title: "URL Configuration" };

export const dynamic = "force-dynamic";

export default async function AuthUrlsPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!(await resolveProject(ref))) notFound();

  return <UrlConfigurationPage projectRef={ref} />;
}
