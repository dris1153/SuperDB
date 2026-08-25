"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconLock, IconSearch } from "@tabler/icons-react";
import type { InventoryProject } from "@/lib/inventory";
import { ProjectStatus } from "./status";
import { Badge } from "./ui/badge";
import { Empty } from "./ui/empty-state";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { date } from "@/lib/format";

// Radix Select reserves the empty string for "no value", so the unfiltered option needs a sentinel.
const ALL = "__all__";

const HEAD = "text-xs font-normal text-subtle";

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
        <div className="rounded-lg border border-border">
          <Table className="min-w-3xl">
            <TableHeader className="bg-card">
              <TableRow className="hover:bg-transparent">
                {["Project", "Owner", "Tags", "Organization", "Status", "Region", "Postgres", "Created"].map((h) => (
                  <TableHead key={h} className={HEAD}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.ref}>
                  <TableCell>
                    <Link href={`/p/${p.ref}`} className="text-foreground hover:text-brand-text">
                      {p.name}
                    </Link>
                    <div className="font-mono text-xs text-subtle">{p.ref}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {/* OAuth rows are named by organization: /v1/profile is unavailable to them. */}
                      <IconLock
                        size={13}
                        stroke={1.5}
                        className={p.kind === "oauth" ? "text-primary" : "text-subtle"}
                        title={p.kind === "oauth" ? "OAuth connection" : "Access token connection"}
                      />
                      {p.owner}
                    </span>
                  </TableCell>
                  <TableCell>
                    {p.tags.length === 0 ? (
                      <span className="text-subtle">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {p.tags.map((t) => (
                          <Badge key={t} variant="outline" className="rounded-full">{t}</Badge>
                        ))}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.orgName}</TableCell>
                  <TableCell><ProjectStatus status={p.status} /></TableCell>
                  <TableCell className="font-mono text-xs text-subtle">{p.region}</TableCell>
                  <TableCell className="font-mono text-xs text-subtle">{p.database?.version ?? "—"}</TableCell>
                  <TableCell className="text-subtle">{date(p.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
