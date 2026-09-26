import type { ReactNode } from "react";
import { Empty } from "@/components/ui/empty-state";

/** The editor's full-page "nothing to show" state, used for both an unreadable database and a
 *  schema or table with nothing in it. */
export function TableEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="p-6">
      <Empty>{children}</Empty>
    </div>
  );
}
