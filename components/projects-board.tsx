"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { IconLock, IconSearch } from "@tabler/icons-react";
import type { InventoryProject } from "@/lib/inventory";
import {
  ALL,
  isReorderable,
  PROJECT_SORTS,
  sortProjects,
  type ProjectSort,
} from "@/lib/project-sort";
import { SortableProjects } from "./sortable-projects";
import { ProjectStatus } from "./status";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { Empty } from "./ui/empty-state";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";


export function ProjectsBoard({
  projects,
  ordered,
  reorder,
  reset,
}: {
  projects: InventoryProject[];
  ordered: boolean;
  reorder: (refs: string[]) => Promise<void>;
  reset: () => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [tag, setTag] = useState(ALL);
  const [sort, setSort] = useState<ProjectSort>("manual");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetting, startReset] = useTransition();

  const owners = useMemo(() => [...new Set(projects.map((p) => p.owner))].sort(), [projects]);
  const statuses = useMemo(() => [...new Set(projects.map((p) => p.status))].sort(), [projects]);
  const tags = useMemo(() => [...new Set(projects.flatMap((p) => p.tags))].sort(), [projects]);

  // The tag Select unmounts once no connection carries a tag, and a selection left behind would
  // filter the board to nothing with no control on screen to clear it. Derived rather than reset, so
  // the choice comes back if the tag does — and so nothing writes state during a render.
  const activeTag = tags.includes(tag) ? tag : ALL;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return projects.filter((p) => {
      if (owner !== ALL && p.owner !== owner) return false;
      if (status !== ALL && p.status !== status) return false;
      if (activeTag !== ALL && !p.tags.includes(activeTag)) return false;
      if (!needle) return true;
      return [p.name, p.ref, p.orgName, p.region, p.owner, ...p.tags].some((v) =>
        v?.toLowerCase().includes(needle),
      );
    });
  }, [projects, q, owner, status, activeTag]);

  // Separate from the filter memo so changing the sort does not re-run the filter, and so sorting
  // applies to what is on screen rather than to everything.
  const rows = useMemo(() => sortProjects(filtered, sort), [filtered, sort]);

  // Every control at its default. Only then does a drop have a position it could mean. Load-bearing,
  // not cosmetic: a write from a filtered view would renumber only the visible subset and interleave
  // it with everything left at its old position.
  const clean = isReorderable({ sort, search: q, owner, status, tag: activeTag });


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <IconSearch size={15} stroke={1.5} className="absolute left-2.5 top-2.5 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects, refs, orgs…"
            className="pl-8"
          />
        </div>

        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All owners</SelectItem>
            {owners.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>{s.toLowerCase().replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Tags live on the connection, so this narrows to whole organizations, not single projects. */}
        {tags.length > 0 ? (
          <Select value={activeTag} onValueChange={setTag}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {/* Last, because it changes the order rather than what is in it. */}
        <Select value={sort} onValueChange={(v) => setSort(v as ProjectSort)}>
          <SelectTrigger className="w-44" aria-label="Sort projects">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_SORTS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Reordering needs an unambiguous drop position, which only the unfiltered, unsorted view has:
          anywhere else the cards on screen are a subset in some other order. Saying so beats letting
          a card snap back with no explanation. */}
      {!clean && rows.length > 0 ? (
        <p className="text-xs text-subtle">
          Reordering is off while the board is filtered or sorted.
        </p>
      ) : null}

      {/* Only when there is something to undo: the board cannot tell a saved order from the
          connection order it falls back to, so the server says. */}
      {clean && ordered ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={resetting}
            onClick={() =>
              startReset(async () => {
                setResetError(null);
                try {
                  await reset();
                } catch (e) {
                  // Unawaited, this failed in silence: no error boundary catches a rejected promise
                  // from an event handler, so the button simply stopped working with no explanation.
                  setResetError(e instanceof Error ? e.message : "Could not reset the order");
                }
              })
            }
            className="text-xs text-subtle hover:text-foreground disabled:opacity-50"
          >
            {resetting ? "Resetting…" : "Reset to connection order"}
          </button>
          {resetError ? (
            <span className="text-xs text-destructive" role="alert">
              {resetError}
            </span>
          ) : null}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <Empty>No project matches these filters.</Empty>
      ) : (
        <SortableProjects
          key={String(clean)}
          tiles={rows.map((p) => ({
            id: p.ref,
            label: p.name,
            card: (controls) => <ProjectCard project={p} controls={controls} />,
          }))}
          disabled={!clean}
          reorder={reorder}
        />
      )}
    </div>
  );
}

/**
 * Postgres version and creation date are deliberately absent — both are on the project page, and
 * neither drives a decision while scanning a list.
 *
 * The link wraps the card's content rather than the card itself, so the reorder controls can sit
 * inside the card without nesting a button in an anchor — invalid HTML that every build tool here
 * accepts silently and that browsers and screen readers then resolve however they like. `group` moved
 * to the Card for the same reason: hover still covers the whole card, but the click target is the
 * content.
 */
function ProjectCard({ project, controls }: { project: InventoryProject; controls?: ReactNode }) {
  return (
    <Card className="group h-full gap-0 p-4 transition-colors hover:border-brand-border">
      {controls}
      <Link href={`/p/${project.ref}`} className="block">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm text-foreground group-hover:text-brand-text">{project.name}</span>
          <ProjectStatus status={project.status} />
        </div>
        <div className="font-mono text-xs text-subtle">{project.ref}</div>

        <div className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
          {/* OAuth connections are named by organization: /v1/profile is unavailable to them. */}
          <IconLock
            size={13}
            stroke={1.5}
            className={project.kind === "oauth" ? "text-primary" : "text-subtle"}
            title={project.kind === "oauth" ? "OAuth connection" : "Access token connection"}
          />
          <span className="truncate">{project.owner}</span>
        </div>
        <div className="truncate text-xs text-subtle">
          {project.orgName} · {project.region}
        </div>

        {project.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {project.tags.map((t) => (
              <Badge key={t} variant="outline" className="rounded-full">{t}</Badge>
            ))}
          </div>
        ) : null}
      </Link>
    </Card>
  );
}
