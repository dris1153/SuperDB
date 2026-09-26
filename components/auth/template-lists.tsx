"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";
import { toast } from "sonner";
import { NOTIFICATIONS, TEMPLATES, type EmailConfig } from "@/lib/auth-config";
import { saveNotifications } from "@/lib/auth-config-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

/**
 * The Templates tab: two card lists, as the original has them.
 *
 * *Authentication* rows open the template's own page. *Security* rows do the same and carry the
 * switch that decides whether that mail is sent at all, with one Save for the seven — they are one
 * section of one config, and `saveNotifications` sends only those booleans, because a PATCH mixing
 * kinds of field can refuse one and apply another (measured).
 *
 * Rows are links, not buttons: middle-click and a new tab are what a list of editors should allow.
 */
export function TemplateLists({
  projectRef,
  config,
  onSaved,
}: {
  projectRef: string;
  config: EmailConfig;
  onSaved: () => void;
}) {
  const [flags, setFlags] = useState(config.notifications);
  const [busy, start] = useTransition();

  // Re-seeded when the saved values change under it — after a save, or when the part refetches.
  const [seen, setSeen] = useState(config.notifications);
  if (seen !== config.notifications) {
    setSeen(config.notifications);
    setFlags(config.notifications);
  }

  const dirty = NOTIFICATIONS.some((n) => flags[n.field] !== config.notifications[n.field]);
  const href = (key: string) => `/p/${projectRef}/auth/emails/${key}`;

  const save = () =>
    start(async () => {
      const result = await saveNotifications(projectRef, flags);
      if (!result.ok) {
        toast.error(result.reason);
        return;
      }
      toast.success("Notifications saved.");
      onSaved();
    });

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h2 className="text-lg text-foreground">Authentication</h2>
        <div className="divide-y divide-border rounded-lg border border-border">
          {TEMPLATES.filter((t) => t.group === "authentication").map((t) => (
            <Link
              key={t.key}
              href={href(t.key)}
              className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40"
            >
              <Row label={t.label} description={t.description} customised={config.templates[t.key]?.customised} />
              <IconChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg text-foreground">Security</h2>
        <div className="divide-y divide-border rounded-lg border border-border">
          {TEMPLATES.filter((t) => t.group === "security").map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <Row label={t.label} description={t.description} customised={config.templates[t.key]?.customised} />
              <div className="flex shrink-0 items-center gap-3">
                <Switch
                  checked={flags[t.toggle as string] === true}
                  disabled={busy}
                  aria-label={`Send the ${t.label.toLowerCase()} email`}
                  onCheckedChange={(next) =>
                    setFlags((current) => ({ ...current, [t.toggle as string]: next }))
                  }
                />
                <Link href={href(t.key)} aria-label={`Edit the ${t.label.toLowerCase()} template`}>
                  <IconChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </div>
            </div>
          ))}

          <div className="flex justify-end px-5 py-3">
            <Button size="sm" disabled={busy || !dirty} onClick={save}>
              Save changes
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Row({
  label,
  description,
  customised,
}: {
  label: string;
  description: string;
  customised?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="flex items-center gap-2 text-sm text-foreground">
        {label}
        {/* The server's own flag, which turns off again when the default text is written back. */}
        {customised ? (
          <Badge variant="outline" className="text-[10px]">
            Customised
          </Badge>
        ) : null}
      </div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </div>
  );
}
