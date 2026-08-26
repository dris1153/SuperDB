"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ChartInterval } from "@/lib/logs-sql";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const INTERVALS: { value: ChartInterval; label: string }[] = [
  { value: "15min", label: "Last 15 minutes" },
  { value: "30min", label: "Last 30 minutes" },
  { value: "1hr", label: "Last 60 minutes" },
  { value: "1day", label: "Last 24 hours" },
];

/**
 * Writes the range into the URL so the server re-renders with new data. No client-side fetching, and
 * the chosen range survives a reload or a shared link.
 */
export function IntervalPicker({ value }: { value: ChartInterval }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const query = new URLSearchParams(params);
        query.set("interval", next);
        router.replace(`${pathname}?${query}`);
      }}
    >
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {INTERVALS.map((i) => (
          <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
