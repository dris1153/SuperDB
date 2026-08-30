"use client";

import { useState, useTransition } from "react";
import { IconDownload } from "@tabler/icons-react";
import { exportRows } from "@/lib/table-actions";
import { EXPORT_LIMIT } from "@/lib/table-export";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Format = "csv" | "json";
type Scope = "page" | "all";

export function ExportMenu({
  projectRef,
  schema,
  table,
  urlQuery,
  page,
  size,
}: {
  projectRef: string;
  schema: string;
  table: string;
  /** Sort, filters and search exactly as the page resolved them, so the export matches the view. */
  urlQuery: { sort?: string; filter?: string[]; search?: string };
  page: number;
  size: number;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<Format>("csv");
  const [scope, setScope] = useState<Scope>("page");
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const run = () =>
    start(async () => {
      setNote(null);
      const result = await exportRows(projectRef, schema, table, urlQuery, {
        format,
        scope,
        page,
        size,
      });
      if ("error" in result) {
        setNote(result.error);
        return;
      }
      // The download is built here rather than served from a route: the action already returns the
      // text, and a Blob URL avoids adding an endpoint that would need its own authorisation.
      const blob = new Blob([result.text], {
        type: format === "csv" ? "text/csv;charset=utf-8" : "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${schema}.${table}.${format}`;
      a.click();
      URL.revokeObjectURL(url);

      if (result.capped) {
        setNote(`Wrote the first ${EXPORT_LIMIT.toLocaleString()} rows — there may be more.`);
      } else {
        setOpen(false);
      }
    });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <IconDownload size={13} stroke={1.5} />
          Export
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3">
        <div className="flex items-center gap-2">
          <Select value={format} onValueChange={(v) => setFormat(v as Format)}>
            <SelectTrigger size="sm" className="h-7 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
            </SelectContent>
          </Select>
          <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <SelectTrigger size="sm" className="h-7 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="page">This page</SelectItem>
              <SelectItem value="all">All matching rows</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-[11px] text-subtle">
          Current sort, filters and search apply. Values are exported in full, not shortened as the
          grid shows them.
          {scope === "all" ? ` At most ${EXPORT_LIMIT.toLocaleString()} rows.` : null}
        </p>

        {format === "csv" ? (
          // Prefixing values would corrupt legitimate data, so the caveat is stated instead.
          <p className="text-[11px] text-subtle">
            A value beginning with <code className="font-mono">=</code> is written as-is; some
            spreadsheets treat that as a formula.
          </p>
        ) : null}

        {note ? <p className="text-[11px] text-warn">{note}</p> : null}

        <Button size="sm" className="h-7 w-full text-xs" disabled={busy} onClick={run}>
          {busy ? "Exporting…" : "Download"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
