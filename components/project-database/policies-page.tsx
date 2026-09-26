"use client";

import { useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import type { PoliciesPart } from "@/lib/policy-model";
import { isGuardedSchema } from "@/lib/table-view";
import { Empty } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";
import { PolicyPanel, type PolicyTarget } from "./policy-panel";
import { SchemaSelect, useSchemaParam } from "./schema-select";
import { TablePoliciesCard } from "./table-policies-card";

/**
 * Database › Policies, as the original lays it out: a card per table. Whether the schema is exposed
 * to the Data API comes from the `schemas` part the picker already reads.
 */
export function PoliciesPage({ projectRef, projectName }: { projectRef: string; projectName: string }) {
  const [schema, setSchema] = useSchemaParam();
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<PolicyTarget | null>(null);

  const state = useProjectPart<PoliciesPart>(projectRef, "db-policies", { schema });
  const schemas = useProjectPart<{ schemas: string[]; exposed: string[] | null }>(projectRef, "schemas");
  const exposed = schemas.status === "ready" && schemas.data.exposed ? schemas.data.exposed.includes(schema) : null;
  const locked = isGuardedSchema(schema);

  const needle = search.trim().toLowerCase();
  const tables = state.status === "ready"
    ? state.data.tables
        .map((t) => (!needle || t.name.toLowerCase().includes(needle) ? t : { ...t, policies: t.policies.filter((p) => p.name.toLowerCase().includes(needle)) }))
        .filter((t) => !needle || t.name.toLowerCase().includes(needle) || t.policies.length > 0)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SchemaSelect projectRef={projectRef} schema={schema} onChange={setSchema} />
        <div className="relative">
          <IconSearch className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter tables and policies" className="h-8 w-60 pl-8" />
        </div>
      </div>

      {isWaiting(state) ? (
        <div className="space-y-4">
          {[0, 1].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : state.status !== "ready" ? (
        <Empty>{reasonOf(state)}</Empty>
      ) : tables.length === 0 ? (
        <Empty>{needle ? `No results found for "${search.trim()}"` : `There are no tables in the schema "${schema}"`}</Empty>
      ) : (
        tables.map((t) => (
          <TablePoliciesCard key={t.name} projectRef={projectRef} projectName={projectName} schema={schema} table={t} exposed={exposed} locked={locked}
            onCreate={() => setTarget({ table: t.name, policy: null })} onEdit={(policy) => setTarget({ table: t.name, policy })} />
        ))
      )}

      <PolicyPanel target={target} onClose={() => setTarget(null)} projectRef={projectRef} projectName={projectName} schema={schema}
        roles={state.status === "ready" ? state.data.roles : []} />
    </div>
  );
}
