"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconLock, IconSearch } from "@tabler/icons-react";
import type { InventoryProject } from "@/lib/inventory";
import { ProjectStatus } from "./status";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { Empty } from "./ui/empty-state";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

// Radix Select reserves the empty string for "no value", so the unfiltered option needs a sentinel.
const ALL = "__all__";

export function ProjectsBoard({ projects }: { projects: InventoryProject[] }) {
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [tag, setTag] = useState(ALL);

  const owners = useMemo(() => [...new Set(projects.map((p) => p.owner))].sort(), [projects]);
  const statuses = useMemo(() => [...new Set(projects.map((p) => p.status))].sort(), [projects]);
  const tags = useMemo(() => [...new Set(projects.flatMap((p) => p.tags))].sort(), [projects]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return projects.filter((p) => {
      if (owner !== ALL && p.owner !== owner) return false;
      if (status !== ALL && p.status !== status) return false;
      if (tag !== ALL && !p.tags.includes(tag)) return false;
      if (!needle) return true;
      return [p.name, p.ref, p.orgName, p.region, p.owner, ...p.tags].some((v) =>
        v?.toLowerCase().includes(needle),
      );
    });
  }, [projects, q, owner, status, tag]);

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
          <Select value={tag} onValueChange={setTag}>
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
      </div>

      {rows.length === 0 ? (
        <Empty>No project matches these filters.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <ProjectCard key={p.ref} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Postgres version and creation date are deliberately absent — both are on the project page, and
 * neither drives a decision while scanning a list.
 */
function ProjectCard({ project }: { project: InventoryProject }) {
  return (
    <Link href={`/p/${project.ref}`} className="group">
      <Card className="h-full gap-0 p-4 transition-colors group-hover:border-brand-border">
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
      </Card>
    </Link>
  );
}
