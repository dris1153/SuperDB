"use client";

import type { buildImportRows } from "@/lib/csv-import";

/** Where an import got to. `committed` is the honest number, whether or not it finished. */
export type Report = { committed: number; failedBatch?: number; reason?: string };

/**
 * What the file will not contribute, before anything is written.
 *
 * Named by line number so the file can be fixed. A short row is left out rather than padded — padding
 * writes NULL over columns nobody mentioned — and a cell that will not become its column's type takes
 * its row with it rather than failing a batch of 500 at the database.
 */
/** Everything the sheet has to say about a file: what it will drop, where it got to, how it went. */
export function ImportStatus({
  built,
  report,
  progress,
}: {
  built: ReturnType<typeof buildImportRows>;
  report: Report | null;
  /** Null unless a run is actually in flight, so a finished import shows its report instead. */
  progress: { done: number; total: number } | null;
}) {
  return (
    <>
      <ImportNotes built={built} />
      {report ? <ImportReport report={report} /> : null}
      {progress ? (
        <p className="text-xs text-subtle">
          Batch {progress.done} of {progress.total}…
        </p>
      ) : null}
    </>
  );
}

function ImportNotes({ built }: { built: ReturnType<typeof buildImportRows> }) {
  const dropped = built.skipped.length + new Set(built.errors.map((e) => e.line)).size;
  if (dropped === 0) return null;

  return (
    <div className="space-y-1 rounded-md border border-warn/40 px-3 py-2 text-xs text-warn">
      <p>
        {dropped} line{dropped === 1 ? "" : "s"} will not be imported.
      </p>
      {built.skipped.length > 0 ? (
        <p>
          Wrong number of fields on line{built.skipped.length === 1 ? "" : "s"}{" "}
          {built.skipped.slice(0, 10).join(", ")}
          {built.skipped.length > 10 ? ` and ${built.skipped.length - 10} more` : ""}.
        </p>
      ) : null}
      {built.errors.slice(0, 5).map((e) => (
        <p key={`${e.line}-${e.column}`}>
          Line {e.line}: {e.message}
        </p>
      ))}
      {built.errors.length > 5 ? <p>and {built.errors.length - 5} more.</p> : null}
    </div>
  );
}

/**
 * What happened.
 *
 * A failure names the batch and the number already committed. Batches are separate requests and so
 * separate transactions; presenting a partial import as all-or-nothing would be the one lie this
 * phase is built to avoid.
 */
function ImportReport({ report }: { report: Report }) {
  if (report.failedBatch == null) {
    return (
      <p className="rounded-md border border-border px-3 py-2 text-xs">
        Imported {report.committed} row{report.committed === 1 ? "" : "s"}.
      </p>
    );
  }
  return (
    <div className="space-y-1 rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive">
      <p>
        Batch {report.failedBatch} failed. {report.committed} row
        {report.committed === 1 ? "" : "s"} were written before it and are still there.
      </p>
      <p>{report.reason}</p>
    </div>
  );
}
