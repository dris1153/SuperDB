"use client";

import { IconArchive, IconCpu, IconDatabase, IconGitBranch } from "@tabler/icons-react";
import type { Addon, Backup, BackupsResponse, Branch, Migration } from "@/lib/mgmt-api";
import type { Project } from "@/lib/mgmt-api";
import { computeLabel, statusLabel } from "@/lib/regions";
import { date } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { StatusDots } from "@/components/status-dots";
import { useProjectPart } from "@/components/use-project-part";
import { PartValue, Tile } from "./tile";

/**
 * The five facts across the top: status, compute, branch, migration, backup.
 *
 * Four separate queries rather than one, so a slow one does not hold the others — measured
 * 2026-09-15, migrations took 923 ms against 157 ms for addons, and under the old page every tile
 * waited for the slowest call on the page.
 *
 * Status comes from the server: the page already resolved the project to know it exists.
 */
export function OverviewTiles({ projectRef, status }: { projectRef: string; status: Project["status"] }) {
  const addons = useProjectPart<{ selected_addons: Addon[] }>(projectRef, "addons");
  const branches = useProjectPart<Branch[]>(projectRef, "branches");
  const migrations = useProjectPart<Migration[]>(projectRef, "migrations");
  const backups = useProjectPart<BackupsResponse>(projectRef, "backups");

  return (
    // GitHub is absent on purpose: the Management API exposes no way to know whether a repository is
    // connected, and printing "No repository connected" would be asserting a fact we cannot check.
    <div className="grid gap-x-6 gap-y-7 sm:grid-cols-2">
      <Tile icon={<StatusDots status={status} />} label="Status">
        {statusLabel(status)}
      </Tile>

      <Tile icon={<IconCpu size={20} stroke={1.5} />} label="Compute">
        <PartValue state={addons}>
          {(data) => (
            <Badge variant="outline" className="rounded-md font-mono text-[11px]">
              {computeLabel(data.selected_addons)}
            </Badge>
          )}
        </PartValue>
      </Tile>

      <Tile icon={<IconGitBranch size={20} stroke={1.5} />} label="Recent branch">
        <PartValue state={branches}>
          {(data) => <>{(data.find((b) => b.is_default) ?? data[0])?.name ?? "No branches"}</>}
        </PartValue>
      </Tile>

      <Tile icon={<IconDatabase size={20} stroke={1.5} />} label="Last migration">
        <PartValue state={migrations}>
          {(data) => {
            const last = data[data.length - 1];
            return <>{last ? (last.name ?? last.version) : "No migrations"}</>;
          }}
        </PartValue>
      </Tile>

      <Tile icon={<IconArchive size={20} stroke={1.5} />} label="Last backup">
        <PartValue state={backups}>
          {(data) => <>{lastBackup(data) ? date(lastBackup(data)!.inserted_at) : "No backups"}</>}
        </PartValue>
      </Tile>
    </div>
  );
}

const lastBackup = (data: BackupsResponse): Backup | undefined => data.backups?.[0];
