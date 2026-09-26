"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { EmailConfig, SmtpField } from "@/lib/auth-config";
import { clearSmtp, saveSmtp } from "@/lib/auth-config-actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type Field = { key: SmtpField; label: string; help: string; suffix?: string; numeric?: boolean };

const SENDER: Field[] = [
  { key: "smtp_admin_email", label: "Sender email address", help: "The email address the emails are sent from." },
  { key: "smtp_sender_name", label: "Sender name", help: "Name displayed in the recipient's inbox." },
];

const PROVIDER: Field[] = [
  { key: "smtp_host", label: "Host", help: "Hostname or IP address of your SMTP server." },
  {
    key: "smtp_port",
    label: "Port number",
    help: "Port used by your SMTP server. Common ports include 465 and 587. Avoid using port 25 as it is often blocked by providers to curb spam.",
    numeric: true,
  },
  {
    key: "smtp_max_frequency",
    label: "Minimum interval per user",
    help: "The minimum time in seconds between emails before another email can be sent to the same user.",
    suffix: "seconds",
    numeric: true,
  },
  { key: "smtp_user", label: "Username", help: "Username for your SMTP server." },
];

/**
 * SMTP, laid out as the original has it, with a switch that does what it says.
 *
 * **There is no enabled flag.** `/config/auth` carries seven `smtp_*` fields and nothing that says
 * whether custom SMTP is on — "on" is `smtp_host` being set. So the switch reads that, switching on
 * only reveals the form, and switching off and saving nulls the provider fields, behind a confirm.
 * Measured on a scratch project before this was built: the clear answers 200, reads back null, and
 * leaves `smtp_max_frequency` at 60.
 *
 * **A stored password is known, not guessed.** The config returns a 64-character stand-in when one
 * is set and null when not — measured on both — and the part reduces it to a yes or no. So the help
 * line can say a password is stored when one is, rather than hedging.
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
  const wasEnabled = config.smtpHost !== null;
  const [enabled, setEnabled] = useState(wasEnabled);
  const [fields, setFields] = useState(config.smtp);
  const [password, setPassword] = useState("");
  const [confirmOff, setConfirmOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const [seen, setSeen] = useState(config);
  if (seen !== config) {
    setSeen(config);
    setFields(config.smtp);
    setEnabled(config.smtpHost !== null);
  }

  const changed =
    enabled !== wasEnabled ||
    (enabled && ([...SENDER, ...PROVIDER].some((f) => fields[f.key] !== config.smtp[f.key]) || password !== ""));

  const save = () => {
    setError(null);

    // Switching off is the one save on this page that can stop a project's mail. It goes through
    // the confirm, never straight to the API.
    if (!enabled && wasEnabled) {
      setConfirmOff(true);
      return;
    }

    if (enabled && !fields.smtp_host?.trim()) {
      setError("A host is required — without one, custom SMTP is not on.");
      return;
    }

    start(async () => {
      const result = await saveSmtp(projectRef, fields, password);
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      toast.success("SMTP settings saved.");
      setPassword("");
      onSaved();
    });
  };

  const turnOff = () =>
    start(async () => {
      const result = await clearSmtp(projectRef);
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      toast.success("Custom SMTP turned off.");
      setConfirmOff(false);
      onSaved();
    });

  const input = (f: Field) => (
    <div key={f.key} className="space-y-1.5">
      <label htmlFor={f.key} className="text-sm text-foreground">
        {f.label}
      </label>
      <div className="relative">
        <Input
          id={f.key}
          value={fields[f.key] ?? ""}
          onChange={(e) => setFields((current) => ({ ...current, [f.key]: e.target.value }))}
          inputMode={f.numeric ? "numeric" : undefined}
          className={f.suffix ? "pr-20" : undefined}
        />
        {f.suffix ? (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
            {f.suffix}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{f.help}</p>
    </div>
  );

  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      <div className="flex items-center justify-between gap-4 p-5">
        <div className="space-y-0.5">
          <div className="text-sm text-foreground">Enable custom SMTP</div>
          <p className="text-sm text-muted-foreground">
            Send auth emails through your custom SMTP provider. Rate limits apply.
          </p>
        </div>
        <Switch checked={enabled} disabled={busy} onCheckedChange={setEnabled} aria-label="Enable custom SMTP" />
      </div>

      {enabled ? (
        <>
          <Section title="Sender details" description="Configure the sender information for your emails.">
            {SENDER.map(input)}
          </Section>

          <Section
            title="SMTP provider settings"
            description="Stored by Supabase. The password is never sent back — the API answers with a stand-in."
          >
            {PROVIDER.map(input)}

            <div className="space-y-1.5">
              <label htmlFor="smtp_pass" className="text-sm text-foreground">
                Password
              </label>
              <Input
                id="smtp_pass"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder={config.hasSmtpPassword ? "••••••••••••••••" : undefined}
              />
              <p className="text-xs text-muted-foreground">
                {config.hasSmtpPassword
                  ? "Stored password is hidden. Enter a new password to replace it."
                  : "Password for your SMTP server."}
              </p>
            </div>
          </Section>
        </>
      ) : wasEnabled ? (
        <p className="p-5 text-sm text-muted-foreground">
          Saving now turns custom SMTP off and clears these settings.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 p-4">
        <span className="text-sm text-destructive">{error}</span>
        <Button size="sm" disabled={busy || !changed} onClick={save}>
          Save changes
        </Button>
      </div>

      <AlertDialog open={confirmOff} onOpenChange={(next) => !busy && setConfirmOff(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off custom SMTP?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Mail goes back through Supabase&apos;s shared service, which is rate limited and
                  not meant for production. The host, port, username and sender details are cleared.
                </p>
                <p>
                  <strong className="text-foreground">The password cannot be shown again</strong> —
                  turning this back on means entering it from wherever it is kept.
                </p>
                <p>On the free plan, template edits are refused again from this moment.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={busy} onClick={turnOff}>
              Turn off custom SMTP
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Label and description on the left, fields on the right — the original's two-column shape. */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="space-y-1">
        <div className="text-sm text-foreground">{title}</div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}
