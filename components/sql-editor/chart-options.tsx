"use client";

import { IconArrowsUpDown } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ChartToggles = { cumulative: boolean; labels: boolean; grid: boolean };

/**
 * The panel beside the chart: which columns, and how to draw them.
 *
 * Beside rather than above, because these are settings rather than a toolbar — and because the
 * previous version crammed them into an eleven-pixel strip that made the whole tab look like a
 * debug view.
 *
 * Flip only offers itself when the category column is numeric. Swapping a text column onto the
 * value axis leaves nothing to measure, and a control that cannot work is worse than one that is
 * not there — so it is disabled with the reason on it.
 */
export function ChartOptions({
  columns,
  numeric,
  x,
  y,
  toggles,
  summary,
  onPick,
  onFlip,
  onToggle,
}: {
  columns: string[];
  numeric: string[];
  x: string;
  y: string;
  toggles: ChartToggles;
  /** Row counts, including anything the chart had to leave out. */
  summary: string;
  onPick: (axis: "x" | "y", column: string) => void;
  onFlip: () => void;
  onToggle: (key: keyof ChartToggles, value: boolean) => void;
}) {
  const flippable = numeric.includes(x);

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-foreground">Chart options</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-[11px]"
          disabled={!flippable}
          onClick={onFlip}
          title={flippable ? "Swap the axes" : "The category column is not numeric, so it cannot be measured"}
        >
          <IconArrowsUpDown size={12} stroke={1.5} />
          Flip
        </Button>
      </div>

      <Axis label="X Axis" value={x} options={columns} onChange={(next) => onPick("x", next)} />
      <Axis label="Y Axis" value={y} options={numeric} onChange={(next) => onPick("y", next)} />

      <div className="space-y-2 pt-1">
        <Toggle
          id="chart-cumulative"
          label="Cumulative"
          checked={toggles.cumulative}
          onChange={(value) => onToggle("cumulative", value)}
        />
        <Toggle
          id="chart-labels"
          label="Show labels"
          checked={toggles.labels}
          onChange={(value) => onToggle("labels", value)}
        />
        <Toggle
          id="chart-grid"
          label="Show grid"
          checked={toggles.grid}
          onChange={(value) => onToggle("grid", value)}
        />
      </div>

      <p className="mt-auto text-[11px] text-subtle">{summary}</p>
    </aside>
  );
}

function Axis({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-subtle">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-full text-xs" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option} className="text-xs">
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      <label htmlFor={id} className="text-muted-foreground">
        {label}
      </label>
    </div>
  );
}
