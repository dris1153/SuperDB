"use client";

import { useSearchParams } from "next/navigation";
import type { EmailConfig } from "@/lib/auth-config";
import { Tab } from "@/components/tab";
import { Empty } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";
import { SmtpSettings } from "./smtp-settings";
import { TemplateLists } from "./template-lists";

type TabKey = "templates" | "smtp";

/**
 * Two views of one config read: the templates, and the server they are sent through.
 *
 * **The tab lives in the URL**, through the history API rather than the router — the way
 * `interval-picker.tsx` keeps its range — so a reload or a shared link lands on the same tab, and
 * switching does not re-render the page on the server to produce markup that has not changed.
 *
 * Each view saves its own fields and then refetches the part, which is what keeps the customised
 * markers and the SMTP switch honest after a save.
 */
export function EmailsPage({ projectRef }: { projectRef: string }) {
  const params = useSearchParams();
  const tab: TabKey = params.get("tab") === "smtp" ? "smtp" : "templates";

  const state = useProjectPart<EmailConfig>(projectRef, "auth-config");
  const refetch = useRefetchPart(projectRef, "auth-config");
  const reload = () => void refetch();

  const go = (next: TabKey) => {
    const query = new URLSearchParams(params);
    if (next === "templates") query.delete("tab");
    else query.set("tab", next);
    // replaceState, not pushState: Back should leave the page, not step through its tabs.
    const qs = query.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  };

  return (
    <section className="space-y-8">
      <div className="flex gap-4 border-b border-border">
        <Tab active={tab === "templates"} onClick={() => go("templates")}>
          Templates
        </Tab>
        <Tab active={tab === "smtp"} onClick={() => go("smtp")}>
          SMTP Settings
        </Tab>
      </div>

      {isWaiting(state) ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : state.status !== "ready" ? (
        <Empty>{reasonOf(state)}</Empty>
      ) : tab === "smtp" ? (
        <SmtpSettings projectRef={projectRef} config={state.data} onSaved={reload} />
      ) : (
        <TemplateLists projectRef={projectRef} config={state.data} onSaved={reload} />
      )}
    </section>
  );
}
