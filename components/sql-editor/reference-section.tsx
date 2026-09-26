"use client";

import { useState } from "react";
import { IconActivity, IconChevronRight } from "@tabler/icons-react";
import { SQL_EXAMPLES, SQL_TEMPLATES, type SqlSnippet } from "@/lib/sql-templates";
import { cn } from "@/lib/utils";

/**
 * The sidebar's REFERENCE section: statements worth having to hand, and a look at what is running.
 *
 * Clicking one opens it in a new tab rather than replacing the buffer in front of the user — with
 * tabs there is no reason to make that a question.
 *
 * Templates write, so they are marked. The editor still asks before any write runs; the marking is
 * so the reader knows before they click, and because these carry placeholders to edit first.
 */
export function ReferenceSection({
  onUse,
  onShowRunning,
}: {
  onUse: (snippet: SqlSnippet) => void;
  onShowRunning: () => void;
}) {
  const [open, setOpen] = useState<"templates" | "examples" | null>(null);

  return (
    <div className="border-t border-border">
      <div className="px-3 pt-2 pb-1 text-[10px] tracking-wide text-subtle/70 uppercase">
        Reference
      </div>

      <Group
        label="Templates"
        hint="Edit the placeholders, then run"
        snippets={SQL_TEMPLATES}
        expanded={open === "templates"}
        onToggle={() => setOpen(open === "templates" ? null : "templates")}
        onUse={onUse}
      />
      <Group
        label="Examples"
        hint="Read-only"
        snippets={SQL_EXAMPLES}
        expanded={open === "examples"}
        onToggle={() => setOpen(open === "examples" ? null : "examples")}
        onUse={onUse}
      />

      <button
        onClick={onShowRunning}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      >
        <IconActivity size={13} stroke={1.5} />
        View running queries
      </button>
    </div>
  );
}

function Group({
  label,
  hint,
  snippets,
  expanded,
  onToggle,
  onUse,
}: {
  label: string;
  hint: string;
  snippets: SqlSnippet[];
  expanded: boolean;
  onToggle: () => void;
  onUse: (snippet: SqlSnippet) => void;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      >
        <IconChevronRight
          size={13}
          stroke={1.5}
          className={cn("shrink-0 transition-transform", expanded && "rotate-90")}
        />
        <span className="flex-1">{label}</span>
        <span className="text-[10px] text-subtle/70">{snippets.length}</span>
      </button>

      {expanded ? (
        <div className="pb-1">
          <p className="px-3 pb-1 pl-7 text-[10px] text-subtle/70">{hint}</p>
          {snippets.map((snippet) => (
            <button
              key={snippet.id}
              onClick={() => onUse(snippet)}
              title={snippet.about}
              className="block w-full truncate py-1 pr-2 pl-7 text-left text-xs text-subtle hover:bg-muted/60 hover:text-foreground"
            >
              {snippet.title}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
