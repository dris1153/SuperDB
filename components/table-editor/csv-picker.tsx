"use client";

import { useRef, useState } from "react";
import { guessMapping, type Mapping } from "@/lib/csv-import";
import { MAX_CSV_BYTES, parseCsv, type CsvFile } from "@/lib/csv-parse";
import type { ColumnInfo } from "@/lib/table-view";
import { Input } from "@/components/ui/input";

/**
 * Choosing a file and reading it.
 *
 * Parsing happens here, in the browser: only parsed rows ever cross to the server. Remount this
 * component to clear it — that resets the native input's filename too, which no prop can.
 */
export function CsvPicker({
  columns,
  onFile,
}: {
  columns: ColumnInfo[];
  /** Null when the pick failed or was cancelled, so the sheet drops whatever it was showing. */
  onFile: (file: CsvFile | null, mapping: Mapping) => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  /** Reading a file is async, so a second pick must be able to discard the first one's answer. */
  const pickId = useRef(0);

  const pick = async (picked: File | undefined) => {
    const id = ++pickId.current;
    setProblem(null);
    onFile(null, []);
    if (!picked) return;

    if (picked.size > MAX_CSV_BYTES) {
      setProblem(
        `That file is ${Math.round(picked.size / 1_000_000)} MB. The limit is ` +
          `${MAX_CSV_BYTES / 1_000_000} MB — import a larger one with psql.`,
      );
      return;
    }

    try {
      const text = await picked.text();
      const parsed = parseCsv(text);
      if (id !== pickId.current) return;
      if (parsed.header.length === 0) {
        setProblem("That file has no header row.");
        return;
      }
      // `File.text()` always decodes as UTF-8, so a Windows-1252 export turns `café` into `caf<?>`
      // and would store it that way. Better to say the file looks wrong than to import mojibake.
      if (text.includes("�")) {
        setProblem("This file does not look like UTF-8 — some characters will import as garbage.");
      }
      onFile(parsed, guessMapping(parsed.header, columns));
    } catch (e) {
      if (id !== pickId.current) return;
      setProblem(e instanceof Error ? e.message : "That file could not be read as CSV.");
    }
  };

  return (
    <>
      <Input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => pick(e.target.files?.[0])}
        aria-label="CSV file"
        className="h-8 text-xs"
      />
      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
    </>
  );
}
