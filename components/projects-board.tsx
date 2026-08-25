"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconLock, IconSearch } from "@tabler/icons-react";
import type { InventoryProject } from "@/lib/inventory";
import { ProjectStatus } from "./status";
import { Empty, Input } from "./ui";
import { date } from "@/lib/format";

const SELECT =
  "rounded-md border border-line-strong bg-canvas px-2.5 py-1.5 text-sm text-fg focus:border-brand focus:outline-none";

export function ProjectsBoard({ projects }: { projects: InventoryProject[] }) {
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState("");

  const owners = useMemo(() => [...new Set(projects.map((p) => p.owner))].sort(), [projects]);
  const statuses = useMemo(() => [...new Set(projects.map((p) => p.status))].sort(), [projects]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return projects.filter((p) => {
      if (owner && p.owner !== owner) return false;
      if (status && p.status !== status) return false;
      if (!needle) return true;
      return [p.name, p.ref, p.orgName, p.region, p.owner, p.label]
        .some((v) => v?.toLowerCase().includes(needle));
    });
  }, [projects, q, owner, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <IconSearch size={15} stroke={1.5} className="absolute left-2.5 top-2.5 text-fg-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects, refs, orgs…"
            className="pl-8"
          />
        </div>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className={SELECT}>
          <option value="">All owners</option>
          {owners.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT}>
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s.toLowerCase().replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <Empty>No project matches these filters.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-3xl text-sm">
            <thead className="border-b border-line bg-panel text-left text-xs text-fg-subtle">
              <tr>
                {["Project", "Owner", "Organization", "Status", "Region", "Postgres", "Created"].map((h) => (
                  <th key={h} className="px-3 py-2 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.ref} className="border-b border-line last:border-0 hover:bg-ash/40">
                  <td className="px-3 py-2">
                    <Link href={`/p/${p.ref}`} className="text-fg hover:text-brand-text">{p.name}</Link>
                    <div className="font-mono text-xs text-fg-subtle">{p.ref}</div>
                  </td>
                  <td className="px-3 py-2 text-fg-muted">
                    <span className="inline-flex items-center gap-1.5">
                      {/* OAuth rows are named by organization: /v1/profile is unavailable to them. */}
                      <IconLock
                        size={13}
                        stroke={1.5}
                        className={p.kind === "oauth" ? "text-brand" : "text-fg-subtle"}
                        title={p.kind === "oauth" ? "OAuth connection" : "Access token connection"}
                      />
                      {p.owner}
                    </span>
                    {p.label ? <span className="ml-1 text-fg-subtle">({p.label})</span> : null}
                  </td>
                  <td className="px-3 py-2 text-fg-muted">{p.orgName}</td>
                  <td className="px-3 py-2"><ProjectStatus status={p.status} /></td>
                  <td className="px-3 py-2 font-mono text-xs text-fg-subtle">{p.region}</td>
                  <td className="px-3 py-2 font-mono text-xs text-fg-subtle">{p.database?.version ?? "—"}</td>
                  <td className="px-3 py-2 text-fg-subtle">{date(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
