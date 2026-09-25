"use client";

import { useSearchParams } from "next/navigation";
import { INTERVALS, type ChartInterval } from "@/lib/logs-sql";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

/** Exported so a card can name the window the reader chose rather than calling it "this period". */
export const INTERVAL_LABELS: Record<ChartInterval, string> = {
  "15min": "Last 15 minutes",
  "30min": "Last 30 minutes",
  "1hr": "Last 60 minutes",
  "1day": "Last 24 hours",
};

/**
 * Writes the range into the URL, so it survives a reload and a shared link.
 *
 * Through the history API rather than the router: the panel reading it fetches its own data now, so
 * a navigation would re-render the page on the server to produce markup that has not changed.
 * Next integrates the history API with `useSearchParams`, which is what makes the panel re-read it.
 */
export function IntervalPicker({ value }: { value: ChartInterval }) {
  const params = useSearchParams();

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const query = new URLSearchParams(params);
        query.set("interval", next);
        // replaceState, not pushState: Back used to leave the page, and pushing an entry per
        // interval change would make it step through the ranges instead.
        window.history.replaceState(null, "", `?${query}`);
      }}
    >
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {INTERVALS.map((i) => (
          <SelectItem key={i} value={i}>{INTERVAL_LABELS[i]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
