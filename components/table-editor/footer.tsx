"use client";

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { PAGE_SIZES } from "@/lib/table-view";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTableUrl } from "./url";

const plain = new Intl.NumberFormat("en-US");
const approx = new Intl.NumberFormat("en-US", { notation: "compact" });

export function TableFooter({
  page,
  size,
  rowsOnPage,
  total,
  exact,
  view,
}: {
  page: number;
  size: number;
  rowsOnPage: number;
  /** Null when the count is genuinely unknown — a view, or a count that failed. */
  total: number | null;
  exact: boolean;
  view: "data" | "definition";
}) {
  const { set, pending } = useTableUrl();

  // With no count there is no last page, so paging forward is gated on the page being full instead.
  // Deriving `pages` from the row count would silently pin the user to page 1 of a million.
  const pages = total == null ? null : Math.max(1, Math.ceil(total / size));
  const canNext = pages == null ? rowsOnPage === size : page < pages;
  const go = (next: number) => {
    if (pending) return;
    set({ page: String(pages == null ? Math.max(1, next) : Math.min(pages, Math.max(1, next))) });
  };

  const toggle = (
    <div className="ml-auto flex overflow-hidden rounded-md border border-border">
      {(["data", "definition"] as const).map((v) => (
        <button
          key={v}
          onClick={() => set({ view: v === "data" ? null : v })}
          className={cn(
            "px-2.5 py-1 capitalize",
            view === v ? "bg-muted text-foreground" : "text-subtle hover:bg-muted",
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );

  // Pagination describes rows; the definition view has none. The toggle stays so there is a way back.
  if (view === "definition") {
    return (
      <div className="flex shrink-0 items-center border-t border-border px-3 py-2 text-xs">
        {toggle}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-3 border-t border-border px-3 py-2 text-xs transition-opacity",
        pending && "opacity-50",
      )}
    >
      <button
        onClick={() => go(page - 1)}
        disabled={page <= 1 || pending}
        aria-label="Previous page"
        className="rounded border border-border p-1 text-muted-foreground disabled:opacity-40"
      >
        <IconChevronLeft size={14} stroke={1.5} />
      </button>
      <span className="text-subtle">
        Page <span className="tabular-nums text-foreground">{page}</span>
        {pages == null ? null : (
          <>
            {" "}
            of <span className="tabular-nums">{pages}</span>
          </>
        )}
      </span>
      <button
        onClick={() => go(page + 1)}
        disabled={!canNext || pending}
        aria-label="Next page"
        className="rounded border border-border p-1 text-muted-foreground disabled:opacity-40"
      >
        <IconChevronRight size={14} stroke={1.5} />
      </button>

      <Select value={String(size)} onValueChange={(v) => set({ size: v, page: "1" })}>
        <SelectTrigger size="sm" className="h-7 w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAGE_SIZES.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n} rows
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* An exact count is printed in full. Compact notation would render 49,999 as "50K", which
          reads as an estimate — and rounding a number the database was scanned to produce is how
          people end up trusting a figure that was never counted. */}
      {total == null ? (
        <span className="text-subtle" title="Views and unanalysed relations have no row estimate">
          count unavailable
        </span>
      ) : (
        <span className="text-subtle" title={exact ? undefined : "Estimated from table statistics"}>
          {exact ? plain.format(total) : `~${approx.format(total)}`}{" "}
          {total === 1 && exact ? "record" : "records"}
        </span>
      )}

      {toggle}
    </div>
  );
}
