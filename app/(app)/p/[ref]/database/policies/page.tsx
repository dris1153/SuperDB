import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IconBook } from "@tabler/icons-react";
import { resolveProject } from "@/lib/inventory";
import { Button } from "@/components/ui/button";
import { PoliciesPage } from "@/components/project-database/policies-page";

export const metadata: Metadata = { title: "Policies" };

export const dynamic = "force-dynamic";

export default async function DatabasePoliciesPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-8">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl text-foreground">Policies</h1>
          <p className="text-sm text-muted-foreground">Manage Row Level Security policies for your tables</p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href="https://supabase.com/docs/guides/database/postgres/row-level-security" target="_blank" rel="noreferrer">
            <IconBook size={14} /> Docs
          </a>
        </Button>
      </header>
      <PoliciesPage projectRef={ref} projectName={found.project.name} />
    </div>
  );
}
