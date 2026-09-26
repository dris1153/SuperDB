"use client";

import { useState, useTransition } from "react";
import { IconCheck, IconTrash, IconWorld } from "@tabler/icons-react";
import { toast } from "sonner";
import { siteUrlProblem, type UrlConfig } from "@/lib/auth-urls";
import { saveSiteUrl } from "@/lib/auth-url-actions";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";
import { External } from "./oauth-apps";
import { AddUrlsDialog, RemoveUrlsDialog, TAKES_A_MINUTE } from "./redirect-url-dialogs";

/** The original's URL Configuration: the Site URL, and the list auth may redirect to. */
export function UrlConfigurationPage({ projectRef }: { projectRef: string }) {
  const state = useProjectPart<UrlConfig>(projectRef, "auth-urls");
  const refetch = useRefetchPart(projectRef, "auth-urls");
  // The OAuth Server page shows the Site URL too, and links here to change it.
  const refetchOAuth = useRefetchPart(projectRef, "oauth-server");

  return (
    <div className="mx-auto max-w-5xl space-y-10 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl text-foreground">URL Configuration</h1>
        <p className="text-sm text-muted-foreground">Configure site URL and redirect URLs for authentication</p>
      </header>

      {isWaiting(state) ? (
        <Skeleton className="h-40 w-full" />
      ) : state.status !== "ready" ? (
        <Empty>{reasonOf(state)}</Empty>
      ) : (
        <>
          <SiteUrl projectRef={projectRef} saved={state.data.siteUrl} onSaved={() => { void refetch(); void refetchOAuth(); }} />
          <RedirectUrls projectRef={projectRef} urls={state.data.redirectUrls} onSaved={() => void refetch()} />
        </>
      )}
    </div>
  );
}

function SiteUrl({ projectRef, saved, onSaved }: { projectRef: string; saved: string; onSaved: () => void }) {
  const [value, setValue] = useState(saved);
  const [seen, setSeen] = useState(saved);
  if (seen !== saved) {
    setSeen(saved);
    setValue(saved);
  }
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const save = () =>
    start(async () => {
      const problem = siteUrlProblem(value);
      if (problem) return setError(problem);
      setError(null);
      const result = await saveSiteUrl(projectRef, value);
      if (!result.ok) return setError(result.reason);
      toast.success("Successfully updated site URL", { description: TAKES_A_MINUTE });
      onSaved();
    });

  return (
    <section className="space-y-4">
      <h2 className="text-lg text-foreground">Site URL</h2>
      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-sm text-foreground">Site URL</div>
            <p className="max-w-xl text-sm text-muted-foreground">
              Configure the default redirect URL used when a redirect URL is not specified or doesn&apos;t match one
              from the allow list. This value is also exposed as a template variable in the email templates
              section. Wildcards cannot be used here.
            </p>
          </div>
          <div className="w-full space-y-1.5 sm:w-96">
            <Input value={value} onChange={(e) => setValue(e.target.value)} aria-label="Site URL"
              placeholder="https://example.com" aria-invalid={!!error} />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        </div>
        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button size="sm" disabled={busy || value.trim() === saved} onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function RedirectUrls({ projectRef, urls, onSaved }: { projectRef: string; urls: string[]; onSaved: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  // A URL removed elsewhere cannot stay selected here.
  const picked = selected.filter((url) => urls.includes(url));

  // As the original: a click toggles one; shift-click toggles the run from the last one picked.
  const pick = (url: string, shift: boolean) => {
    const last = picked.at(-1);
    if (!shift || !last) {
      return setSelected(picked.includes(url) ? picked.filter((u) => u !== url) : [...picked, url]);
    }
    const [a, b] = [urls.indexOf(last), urls.indexOf(url)];
    // Clicked-last either way, so the next shift-click runs from this row, as in the original.
    const run = a < b ? urls.slice(a, b + 1) : urls.slice(b, a + 1).reverse();
    setSelected(run.every((u) => picked.includes(u)) ? picked.filter((u) => !run.includes(u)) : [...picked, ...run.filter((u) => !picked.includes(u))]);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg text-foreground">Redirect URLs</h2>
          <p className="text-sm text-muted-foreground">
            URLs that auth providers are permitted to redirect to post authentication. Wildcards are allowed, for
            example, https://*.domain.com
          </p>
        </div>
        <External href="https://supabase.com/docs/guides/auth/redirect-urls">Docs</External>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        <div className="flex justify-end gap-2 px-5 py-3">
          {picked.length > 0 ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setSelected([])}>Clear selection</Button>
              <Button variant="outline" size="sm" onClick={() => setRemoving(true)}>
                <IconTrash size={14} /> Remove ({picked.length})
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setAdding(true)}>Add URL</Button>
          )}
        </div>

        {urls.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <div className="text-sm text-foreground">No Redirect URLs</div>
            <p className="text-sm text-muted-foreground">Auth providers may need a URL to redirect back to</p>
          </div>
        ) : (
          <div role="group" aria-label="Redirect URLs" className="divide-y divide-border">
            {urls.map((url) => {
              const on = picked.includes(url);
              return (
                <div key={url} role="checkbox" aria-checked={on} tabIndex={0}
                  onClick={(e) => pick(url, e.shiftKey)}
                  onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); pick(url, e.shiftKey); } }}
                  className={`flex cursor-pointer items-center gap-4 px-5 py-3 outline-none select-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset ${on ? "bg-muted/60" : ""}`}>
                  {/* Drawn, not a Radix checkbox: the row is the control, and a button inside it would nest two. */}
                  <span aria-hidden className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border ${on ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>
                    {on ? <IconCheck size={12} stroke={3} /> : null}
                  </span>
                  <IconWorld size={14} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate font-mono text-sm text-foreground" title={url}>{url}</span>
                </div>
              );
            })}
            <p className="py-3 pr-5 pl-14 text-sm text-subtle">Total URLs: {urls.length}</p>
          </div>
        )}
      </div>

      <AddUrlsDialog projectRef={projectRef} existing={urls} open={adding} onOpenChange={setAdding} onSaved={onSaved} />
      <RemoveUrlsDialog projectRef={projectRef} urls={picked} open={removing} onOpenChange={setRemoving}
        onSaved={() => { setSelected([]); onSaved(); }} />
    </section>
  );
}
