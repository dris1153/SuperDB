"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

/**
 * What a write does to the screen now that the page fetches nothing.
 *
 * Every write in this editor used to end in `router.refresh()`, which re-ran the server page and so
 * re-read everything it rendered. The page renders a shell now, so a refresh would repaint markup
 * that has not changed and leave the grid showing rows from before the write.
 *
 * Invalidating the whole `["project", ref]` prefix is the same blunt instrument the refresh was: a
 * column added through the DDL sheet changes the columns, the rows *and* the table list, and naming
 * the affected keys one by one is how a write ends up half-reflected. Writes are rare and
 * deliberate; a handful of refetches after one is the right trade.
 */
export function useRefreshTable(projectRef: string) {
  const client = useQueryClient();
  return useCallback(
    () => client.invalidateQueries({ queryKey: ["project", projectRef] }),
    [client, projectRef],
  );
}
