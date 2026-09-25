"use client";

import { useMemo, useState } from "react";
import { splitLine, valueKind, type ValueKind } from "@/lib/json-line";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * A record, pretty-printed, coloured, and filterable by line.
 *
 * **No highlighting library.** `lib/highlight.ts` is Shiki and `server-only`, and
 * `plans/260926-0153-cold-start/` measured what reaching it costs a route — 10.4 MB of the 13.4 MB
 * the overview page traces. A user record is a flat object; this is a few lines of tokenising.
 *
 * **The filter hides lines; it never rebuilds the object.** This is the one tab whose job is to show
 * the record exactly as the API returned it, so filtering keys out of it would produce JSON that is
 * not the record. Hidden lines are counted out loud for the same reason.
 */
export function JsonView({ value }: { value: unknown }) {
  const [filter, setFilter] = useState("");

  const lines = useMemo(() => JSON.stringify(value, null, 2).split("\n"), [value]);

  const needle = filter.trim().toLowerCase();
  const shown = needle ? lines.filter((line) => line.toLowerCase().includes(needle)) : lines;
  const hidden = lines.length - shown.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          className="h-9"
        />
        <Button variant="outline" size="sm" disabled={!filter} onClick={() => setFilter("")}>
          Clear
        </Button>
      </div>

      {hidden > 0 ? (
        <p className="text-xs text-subtle">
          {hidden} {hidden === 1 ? "line" : "lines"} hidden by the filter.
        </p>
      ) : null}

      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-xs leading-relaxed">
        {shown.map((line, i) => (
          <Line key={i} text={line} />
        ))}
      </pre>
    </div>
  );
}

const COLOURS: Record<ValueKind, string> = {
  string: "text-emerald-400",
  number: "text-orange-400",
  boolean: "text-amber-400",
  null: "text-subtle",
  other: "text-muted-foreground",
};

/**
 * One line, coloured.
 *
 * The taking-apart lives in `lib/json-line.ts`, where it can be tested: a tokeniser that mangles a
 * value would make this tab lie about the record it exists to show, and a `": "` inside a URL is
 * the obvious way to do it.
 */
function Line({ text }: { text: string }) {
  const line = splitLine(text);

  if (line.kind === "plain") {
    return <div className="text-muted-foreground">{line.text || " "}</div>;
  }

  return (
    <div>
      {line.indent}
      <span className="text-sky-400">{line.key}</span>
      {line.separator}
      <span className={COLOURS[valueKind(line.value)]}>{line.value}</span>
      {line.comma ? "," : null}
    </div>
  );
}
