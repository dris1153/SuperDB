"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { NOTIFICATIONS, SMTP_FIELDS, type EmailConfig } from "@/lib/auth-config";
import { saveNotifications, saveSmtp } from "@/lib/auth-config-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const LABELS: Record<(typeof SMTP_FIELDS)[number], string> = {
  smtp_admin_email: "Sender email",
  smtp_sender_name: "Sender name",
  smtp_host: "Host",
  smtp_port: "Port",
  smtp_user: "Username",
  smtp_max_frequency: "Seconds between emails to one address",
};

/** The seven switches, saved as one section because that is how they are read. */
export function SecurityNotifications({
  projectRef,
  config,
  onSaved,
}: {
  projectRef: string;
  config: EmailConfig;
  onSaved: () => void;
}) {
  const [flags, setFlags] = useState(config.notifications);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const [seen, setSeen] = useState(config.notifications);
  if (seen !== config.notifications) {
    setSeen(config.notifications);
    setFlags(config.notifications);
  }

  const dirty = NOTIFICATIONS.some((n) => flags[n.field] !== config.notifications[n.field]);

  const save = () =>
    start(async () => {
      setError(null);
      const result = await saveNotifications(projectRef, flags);

      if (!result.ok) {
        setError(result.reason);
        return;
      }

      toast.success("Notifications saved.");
      onSaved();
    });

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm text-foreground">Security notifications</h2>
        <p className="text-xs text-subtle">
          Mail sent to a user when their account changes. Each one spends from the project&apos;s
          send allowance.
        </p>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border">
        {NOTIFICATIONS.map((n) => (
          <label key={n.field} className="flex items-center justify-between gap-4 p-3 text-sm">
            <span>{n.label}</span>
            <Switch
              checked={flags[n.field] === true}
              disabled={busy}
              onCheckedChange={(next) => setFlags((f) => ({ ...f, [n.field]: next }))}
            />
          </label>
        ))}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end">
        <Button size="sm" disabled={busy || !dirty} onClick={save}>
          Save notifications
        </Button>
      </div>
    </section>
  );
}

/**
 * SMTP, with the password write-only.
 *
 * The API returns `smtp_pass` as null and the part does not ask for it, so there is nothing to show
 * in that box — and an empty box on save means "leave it alone" rather than "clear it".
 */
export function SmtpSettings({
  projectRef,
  config,
  onSaved,
}: {
  projectRef: string;
  config: EmailConfig;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState(config.smtp);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const [seen, setSeen] = useState(config.smtp);
  if (seen !== config.smtp) {
    setSeen(config.smtp);
    setFields(config.smtp);
  }

  const dirty = SMTP_FIELDS.some((f) => fields[f] !== config.smtp[f]) || password !== "";

  const save = () =>
    start(async () => {
      setError(null);
      const result = await saveSmtp(projectRef, fields, password);

      if (!result.ok) {
        setError(result.reason);
        return;
      }

      toast.success("SMTP settings saved.");
      setPassword("");
      onSaved();
    });

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm text-foreground">SMTP settings</h2>
        <p className="text-xs text-subtle">
          {config.smtpHost
            ? `Sending through ${config.smtpHost}.`
            : "No custom SMTP — this project sends through Supabase's shared service, which is rate limited and not for production."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SMTP_FIELDS.map((field) => (
          <label key={field} className="block space-y-1">
            <span className="text-xs text-muted-foreground">{LABELS[field]}</span>
            <Input
              value={fields[field] ?? ""}
              onChange={(e) => setFields((current) => ({ ...current, [field]: e.target.value }))}
              inputMode={field === "smtp_port" || field === "smtp_max_frequency" ? "numeric" : undefined}
            />
          </label>
        ))}

        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Password</span>
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
            placeholder="Unchanged"
          />
        </label>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end">
        <Button size="sm" disabled={busy || !dirty} onClick={save}>
          Save SMTP settings
        </Button>
      </div>
    </section>
  );
}
