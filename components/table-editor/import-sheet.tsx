"use client";

import { useMemo, useState, useTransition } from "react";
import { batch, buildImportRows, type Mapping } from "@/lib/csv-import";
import { IMPORT_BATCH, type CsvFile } from "@/lib/csv-parse";
import { insertRows } from "@/lib/write-actions";
import type { ColumnInfo } from "@/lib/table-view";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CsvPicker } from "./csv-picker";
import { useRefreshTable } from "./use-refresh-table";
import { ImportMapping } from "./import-mapping";
import { ImportStatus, type Report } from "./import-report";
import { WriteConfirm } from "./write-confirm";

/**
 * Importing a CSV.
 *
 * Parsing happens here, in the browser; only parsed rows cross to the server, as JSON, through the
 * same `insertRows` a single typed row uses. There is no import-specific SQL to keep safe.
 *
 * Batches are separate requests and therefore separate transactions — a multi-statement request
 * returns only its last result, and `BEGIN` cannot span requests. So a failure partway through
 * leaves earlier batches committed, and the report says so rather than implying all-or-nothing.
 */
export function ImportSheet({
  open,
  onOpenChange,
  projectRef,
  projectName,
  schema,
  table,
  columns,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectRef: string;
  projectName: string;
  schema: string;
  table: string;
  columns: ColumnInfo[];
}) {
  const refresh = useRefreshTable(projectRef);
  const [file, setFile] = useState<CsvFile | null>(null);
  const [mapping, setMapping] = useState<Mapping>([]);
  const [emptyAsNull, setEmptyAsNull] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  /** Bumped to remount the picker, which is the only way to clear the native input's filename. */
  const [pickerKey, setPickerKey] = useState(0);
  const [busy, start] = useTransition();

  const reset = () => {
    setFile(null);
    setMapping([]);
    setProgress(null);
    setReport(null);
    setPickerKey((k) => k + 1);
  };

  // Memoised: at the row cap this walks 50,000 rows, and the batch loop sets progress state on every
  // batch — without it each of those renders would rebuild the whole file.
  const built = useMemo(
    () =>
      file
        ? buildImportRows(file, mapping, columns, { emptyAsNull })
        : { rows: [], errors: [], skipped: [] },
    [file, mapping, columns, emptyAsNull],
  );

  const run = () =>
    start(async () => {
      const batches = batch(built.rows, IMPORT_BATCH);
      let committed = 0;
      setProgress({ done: 0, total: batches.length });

      for (let i = 0; i < batches.length; i++) {
        let result;
        try {
          result = await insertRows(projectRef, schema, table, batches[i]);
        } catch {
          setReport({
            committed,
            failedBatch: i + 1,
            reason: "The request failed before it answered, so this batch may or may not have run.",
          });
          setConfirming(false);
          refresh();
          return;
        }
        if (!result.ok) {
          setReport({ committed, failedBatch: i + 1, reason: result.reason });
          setConfirming(false);
          refresh();
          return;
        }
        committed += result.affected;
        setProgress({ done: i + 1, total: batches.length });
      }

      // The file is cleared on success so the button cannot be pressed a second time while the
      // report still reads "Imported 1200 rows" — on an identity key that is 1200 duplicate rows
      // and no undo. Picking the file again is the deliberate way to repeat it.
      reset();
      setReport({ committed });
      setConfirming(false);
      refresh();
    });

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          onOpenChange(next);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="font-mono text-sm">
              Import into {schema}.{table}
            </SheetTitle>
            <SheetDescription>
              Rows are sent in batches of {IMPORT_BATCH}, each its own transaction. A failure partway
              leaves the earlier batches in place.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4 pb-6">
            <CsvPicker
              key={pickerKey}
              columns={columns}
              onFile={(next, guessed) => {
                setFile(next);
                setMapping(guessed);
                setReport(null);
                setProgress(null);
              }}
            />

            {file ? (
              <>
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={emptyAsNull} onCheckedChange={setEmptyAsNull} />
                  Treat empty fields as NULL
                  <span className="text-subtle">
                    — a field written as <span className="font-mono">&quot;&quot;</span> stays an
                    empty string either way
                  </span>
                </label>

                <ImportMapping file={file} mapping={mapping} columns={columns} onChange={setMapping} />
              </>
            ) : null}

            <ImportStatus built={built} report={report} progress={busy ? progress : null} />
          </div>

          <SheetFooter>
            <Button
              size="sm"
              disabled={built.rows.length === 0 || busy}
              onClick={() => setConfirming(true)}
            >
              Import {built.rows.length} row{built.rows.length === 1 ? "" : "s"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <WriteConfirm
        open={confirming}
        onOpenChange={setConfirming}
        action={`Import ${built.rows.length} row${built.rows.length === 1 ? "" : "s"}`}
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={table}
        affected={built.rows.length}
        busy={busy}
        error={null}
        onConfirm={run}
      />
    </>
  );
}
