"use client";

import { IconDeviceFloppy, IconFilePlus, IconPlayerPlayFilled } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

/**
 * Run, Save, New query.
 *
 * Two of Supabase's own controls are absent rather than disabled: AI generation, which has no
 * backend here, and the role switcher, which this API cannot do. Same call `project-nav.tsx` makes
 * about Integrations — a permanently dead control is a lie rather than a roadmap.
 */
export function EditorToolbar({
  running,
  elsewhere,
  canRun,
  savePending,
  activeName,
  dirty,
  onRun,
  onSave,
  onNew,
}: {
  running: boolean;
  /** A statement is running in another tab. One at a time, so this one's Run waits. */
  elsewhere: boolean;
  canRun: boolean;
  savePending: boolean;
  /** The open query's name, or null for an unsaved buffer — which is what Save asks about. */
  activeName: string | null;
  dirty: boolean;
  onRun: () => void;
  onSave: () => void;
  onNew: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
      {/* Disabled rather than silently ignored while another tab runs: Mod-Enter has nowhere to
          report a refusal, so the button is where the state has to be visible. */}
      <Button size="sm" onClick={onRun} disabled={running || elsewhere || !canRun}>
        <IconPlayerPlayFilled size={12} stroke={1.5} />
        {running ? "Running…" : "Run"}
      </Button>

      <Button variant="outline" size="sm" disabled={savePending || !canRun} onClick={onSave}>
        <IconDeviceFloppy size={12} stroke={1.5} />
        {activeName ? "Save" : "Save as…"}
      </Button>

      <Button variant="ghost" size="sm" onClick={onNew}>
        <IconFilePlus size={12} stroke={1.5} />
        New query
      </Button>

      <span className="ml-auto truncate text-[11px] text-subtle">
        {elsewhere
          ? "Another tab is running."
          : activeName
            ? `${activeName}${dirty ? " — unsaved changes" : ""}`
            : "Ctrl/Cmd + Enter"}
      </span>
    </div>
  );
}
