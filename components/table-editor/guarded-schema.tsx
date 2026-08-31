"use client";

import { useState } from "react";
import { isGuardedSchema } from "@/lib/table-view";
import { Input } from "@/components/ui/input";

/**
 * The extra step `auth` and `storage` ask for.
 *
 * Not a block: repairing one broken `auth.users` row, or adding a column to a table the platform
 * owns, is a legitimate thing to need. Enough friction that it cannot be reflex.
 *
 * Shared by the row-write and schema-change dialogs so the reset rule lives in one place. It clears
 * when the dialog *opens*, not when it closes: a caller that closes by flipping `open` — which every
 * success path does — never goes through Radix's `onOpenChange`, so clearing there left the typed
 * name standing and the second write in a session had no friction at all.
 */
export function useGuardedSchema(open: boolean, schema: string, table: string) {
  const [typed, setTyped] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setTyped("");
  }

  const guarded = isGuardedSchema(schema);
  // The empty-name test matters for the create path, where the name is still being typed: without it
  // an empty box would match an empty name and the guard would pass before anything was entered.
  return { guarded, typed, setTyped, ready: !guarded || (table !== "" && typed === table) };
}

export function GuardedSchemaField({
  schema,
  table,
  typed,
  onChange,
}: {
  schema: string;
  table: string;
  typed: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-warn">
        {schema} is used by the platform itself. Type <span className="font-mono">{table}</span> to
        confirm.
      </p>
      <Input
        value={typed}
        onChange={(e) => onChange(e.target.value)}
        placeholder={table}
        aria-label={`Type ${table} to confirm`}
        className="h-8 font-mono text-xs"
      />
    </div>
  );
}
