import type { ReactNode } from "react";
import { Card } from "./card";

/** No shadcn equivalent — a compact KPI tile for the project detail page. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="gap-0 p-4">
      <div className="text-xs text-subtle">{label}</div>
      <div className="mt-1 text-2xl font-normal tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-subtle">{hint}</div> : null}
    </Card>
  );
}
