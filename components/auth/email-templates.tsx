"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { TEMPLATES, type EmailConfig } from "@/lib/auth-config";
import { saveEmailTemplate } from "@/lib/auth-config-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The six templates, one open at a time.
 *
 * Each save sends that template's two fields. PATCH merges by key, so nothing else in the 243 is
 * touched — including whatever somebody changed in the Supabase dashboard while this page was open.
 */
export function EmailTemplates({
  projectRef,
  config,
  onSaved,
}: {
  projectRef: string;
  config: EmailConfig;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState<string>(TEMPLATES[0].key);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm text-foreground">Email templates</h2>
        {config.smtpHost === null ? (
          // Measured 2026-09-26, and it is enforced rather than advisory: a PATCH to a template
          // field on a free project with the default provider answers 400 "Email template
          // modification is not available for free tier projects using the default email
          // provider." Whether *this* project is on that plan is not something `/config/auth`
          // reports, so the save is still attempted and the API's own sentence is what shows.
          <p className="text-xs text-subtle">
            This project sends through Supabase&apos;s shared mail service. On the free plan that
            combination refuses template edits — set up SMTP below, or expect the save to be turned
            down.
          </p>
        ) : null}
      </div>

      <Tabs value={open} onValueChange={setOpen}>
        <TabsList className="flex-wrap">
          {TEMPLATES.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="gap-2">
              {t.label}
              {config.templates[t.key]?.customised ? (
                <Badge variant="outline" className="text-[10px]">
                  Edited
                </Badge>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {TEMPLATES.map((t) => (
          <TabsContent key={t.key} value={t.key} className="pt-4">
            <TemplateEditor
              projectRef={projectRef}
              templateKey={t.key}
              label={t.label}
              subject={config.templates[t.key]?.subject ?? ""}
              body={config.templates[t.key]?.body ?? ""}
              onSaved={onSaved}
            />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function TemplateEditor({
  projectRef,
  templateKey,
  label,
  subject: savedSubject,
  body: savedBody,
  onSaved,
}: {
  projectRef: string;
  templateKey: string;
  label: string;
  subject: string;
  body: string;
  onSaved: () => void;
}) {
  const [subject, setSubject] = useState(savedSubject);
  const [body, setBody] = useState(savedBody);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  // Re-seeded when the saved values change under it — after a save, or when the part refetches.
  // Without this the editor keeps showing what was typed before a refetch replaced it.
  const [seen, setSeen] = useState({ subject: savedSubject, body: savedBody });
  if (seen.subject !== savedSubject || seen.body !== savedBody) {
    setSeen({ subject: savedSubject, body: savedBody });
    setSubject(savedSubject);
    setBody(savedBody);
  }

  const dirty = subject !== savedSubject || body !== savedBody;

  const save = () =>
    start(async () => {
      setError(null);
      const result = await saveEmailTemplate(projectRef, templateKey, subject, body);

      if (!result.ok) {
        setError(result.reason);
        return;
      }

      toast.success(`${label} saved.`);
      onSaved();
    });

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Subject</span>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Body (HTML)</span>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="h-72 font-mono text-xs"
            spellCheck={false}
          />
        </label>

        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Preview</span>
          {/* `srcDoc` in a sandboxed frame: this is a project's own template, but it is still
              markup from a text box, and rendering it into this page would let it style — or
              script — the dashboard around it. */}
          <iframe
            title={`${label} preview`}
            srcDoc={body}
            sandbox=""
            className="h-72 w-full rounded-lg border border-border bg-white"
          />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end">
        <Button size="sm" disabled={busy || !dirty} onClick={save}>
          Save template
        </Button>
      </div>
    </div>
  );
}
