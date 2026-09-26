import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IconBook } from "@tabler/icons-react";
import { resolveProject } from "@/lib/inventory";
import { Button } from "@/components/ui/button";
import { FunctionsPage } from "@/components/project-database/functions-page";

export const metadata: Metadata = { title: "Functions" };

export const dynamic = "force-dynamic";

export default async function DatabaseFunctionsPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const found = await resolveProject(ref);
  if (!found) notFound();

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl text-foreground">Database Functions</h1>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href="https://supabase.com/docs/guides/database/functions" target="_blank" rel="noreferrer">
            <IconBook size={14} /> Docs
          </a>
        </Button>
      </header>
      <FunctionsPage projectRef={ref} projectName={found.project.name} />
    </div>
  );
}
