"use client";

import { tokenizeSql, type SqlTokenKind } from "@/lib/sql-tokens";

/**
 * SQL, coloured in the browser.
 *
 * `CodeBlock` in `connect-primitives.tsx` renders HTML that Shiki produced on the server, and the
 * connect guides still use it. This one exists because reaching Shiki from `lib/project-parts.ts`
 * put 10.4 MB of grammars on the route every card and the user panel call — measured, 12.7 MB
 * against 2.0 MB without it.
 *
 * The tokens come from `lib/sql-tokens.ts`, which is held to reassembly: what is rendered here is
 * the text the server built, character for character. Copying it copies `code`, never the spans.
 */
const COLOURS: Record<SqlTokenKind, string> = {
  keyword: "text-sky-400",
  string: "text-emerald-400",
  comment: "text-subtle italic",
  number: "text-orange-400",
  quoted: "text-amber-300",
  plain: "",
};

export function SqlCode({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-background p-2.5 font-mono text-xs text-muted-foreground">
      {tokenizeSql(code).map((token, i) => (
        <span key={i} className={COLOURS[token.kind]}>
          {token.text}
        </span>
      ))}
    </pre>
  );
}
