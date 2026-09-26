"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconLayoutSidebar } from "@tabler/icons-react";
import { NAV_MODE_LABELS, NAV_MODES, type NavMode } from "@/lib/nav-mode";
import { cn } from "@/lib/utils";

/**
 * The three-way control at the foot of the rail.
 *
 * **Hand-written rather than a `DropdownMenu`, and that is a measurement.** A Radix menu in the
 * topbar cost 52,160 bytes on every project route — measured, then removed — and this one has three
 * flat items and no nesting. What Radix would add is a focus trap, arrow-key movement and a portal;
 * Escape and outside-click are a few lines, and the rest is not worth 52KB on every page for a
 * control opened a handful of times.
 *
 * The active mode is marked, because `collapsed` and `hover` are both a 48px rail at rest and
 * otherwise indistinguishable.
 */
export function NavModeMenu({
  mode,
  onChange,
  expanded,
}: {
  mode: NavMode;
  onChange: (next: NavMode) => void;
  /** Whether the rail is showing labels, so this row can match the rest of it. */
  expanded: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const dismiss = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Sidebar: ${NAV_MODE_LABELS[mode]}`}
        className={cn(
          "flex items-center gap-2 rounded-md py-1.5 text-sm text-subtle transition-colors hover:bg-muted hover:text-foreground",
          expanded ? "w-full px-2.5" : "size-9 justify-center",
        )}
      >
        <IconLayoutSidebar size={16} stroke={1.5} />
        {expanded ? <span className="truncate">{NAV_MODE_LABELS[mode]}</span> : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-0 left-full z-30 ml-1 w-52 overflow-hidden rounded-md border border-border bg-card py-1 shadow-md"
        >
          {NAV_MODES.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={option === mode}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <IconCheck
                size={14}
                stroke={1.5}
                className={option === mode ? "text-primary" : "invisible"}
              />
              {NAV_MODE_LABELS[option]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
