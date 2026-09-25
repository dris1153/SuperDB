"use client";

import type { EmailConfig } from "@/lib/auth-config";
import { Empty } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";
import { EmailTemplates } from "./email-templates";
import { SecurityNotifications, SmtpSettings } from "./smtp-settings";

/**
 * Three sections over one config read.
 *
 * Each saves its own fields and then refetches the whole part, which is what keeps the "Edited"
 * badges and the SMTP banner honest after a save.
 */
export function EmailsPage({ projectRef }: { projectRef: string }) {
  const state = useProjectPart<EmailConfig>(projectRef, "auth-config");
  const refetch = useRefetchPart(projectRef, "auth-config");
  const reload = () => void refetch();

  if (isWaiting(state)) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (state.status !== "ready") return <Empty>{reasonOf(state)}</Empty>;

  return (
    <div className="space-y-10">
      <EmailTemplates projectRef={projectRef} config={state.data} onSaved={reload} />
      <SecurityNotifications projectRef={projectRef} config={state.data} onSaved={reload} />
      <SmtpSettings projectRef={projectRef} config={state.data} onSaved={reload} />
    </div>
  );
}
