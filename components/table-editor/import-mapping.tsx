"use client";

import type { CsvFile } from "@/lib/csv-parse";
import type { Mapping } from "@/lib/csv-import";
import type { ColumnInfo } from "@/lib/table-view";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Radix refuses an empty value, and this one has to mean "do not import this column". */
const SKIP = "__skip";

/**
 * Which CSV column feeds which table column, and the first few rows as they were read.
 *
 * The guess is shown rather than applied: a mapping that is wrong and invisible writes the right
 * number of rows into the wrong columns, and reports success.
 */
export function ImportMapping({
  file,
  mapping,
  columns,
  onChange,
}: {
  file: CsvFile;
  mapping: Mapping;
  columns: ColumnInfo[];
  onChange: (next: Mapping) => void;
}) {
  const claimed = new Set(mapping.filter((v): v is string => v != null));
  const preview = file.rows.slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {file.header.map((h, i) => (
          <div key={`${h}-${i}`} className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate font-mono text-xs text-foreground" title={h}>
              {h || <span className="italic text-subtle">unnamed</span>}
            </span>
            <span className="text-subtle">→</span>
            <Select
              value={mapping[i] ?? SKIP}
              onValueChange={(v) =>
                onChange(mapping.map((m, j) => (j === i ? (v === SKIP ? null : v) : m)))
              }
            >
              <SelectTrigger size="sm" className="h-8 w-48 text-xs" aria-label={`Map ${h}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SKIP} className="text-xs">
                  Do not import
                </SelectItem>
                {columns
                  // A generated column cannot be written at all, so it is not offered.
                  .filter((c) => !c.generated)
                  .map((c) => (
                    <SelectItem
                      key={c.name}
                      value={c.name}
                      // Claimed by another header — offered, but marked, so swapping is possible
                      // without first clearing the other one.
                      className="font-mono text-xs"
                    >
                      {c.name}
                      <span className="ml-1.5 text-subtle">{c.short_type}</span>
                      {claimed.has(c.name) && mapping[i] !== c.name ? (
                        <span className="ml-1.5 text-warn">taken</span>
                      ) : null}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {preview.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {file.header.map((h, i) => (
                  <th
                    key={`${h}-${i}`}
                    className="px-2 py-1 text-left font-mono font-normal text-subtle"
                  >
                    {mapping[i] ?? <span className="line-through">{h}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, r) => (
                <tr key={r} className="border-b border-border last:border-0">
                  {file.header.map((h, c) => (
                    <td key={`${h}-${c}`} className="max-w-48 truncate px-2 py-1 font-mono">
                      {/* NULL and an empty string read differently here for the same reason they do
                          in the grid: the file distinguishes them and so must the preview. */}
                      {row[c] === null ? (
                        <span className="italic text-subtle">NULL</span>
                      ) : row[c] === "" ? (
                        <span className="italic text-subtle">empty</span>
                      ) : (
                        row[c]
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
