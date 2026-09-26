"use client";

import { useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjectPart } from "@/components/use-project-part";
import { cn } from "@/lib/utils";

/**
 * The schema a Database page is showing, kept in the URL with the history API — as the Emails tab
 * keeps its tab — so a reload or a shared link opens the same one.
 */
export function useSchemaParam(): [string, (next: string) => void] {
  const params = useSearchParams();
  const schema = params.get("schema") || "public";

  const set = (next: string) => {
    const query = new URLSearchParams(params);
    query.set("schema", next);
    window.history.replaceState(null, "", `?${query.toString()}`);
  };

  return [schema, set];
}

/** The original's `schema public` picker. */
export function SchemaSelect({
  projectRef,
  schema,
  onChange,
  className,
}: {
  projectRef: string;
  schema: string;
  onChange: (schema: string) => void;
  className?: string;
}) {
  const state = useProjectPart<{ schemas: string[] }>(projectRef, "schemas");
  const schemas = state.status === "ready" ? state.data.schemas : [];

  return (
    <Select value={schema} onValueChange={onChange}>
      <SelectTrigger size="sm" className={cn("min-w-40 justify-start [&>svg]:ml-auto", className)} aria-label="Schema">
        <span className="text-muted-foreground">schema</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(schemas.includes(schema) ? schemas : [schema, ...schemas]).map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
