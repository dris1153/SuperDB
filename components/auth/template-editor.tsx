"use client";

import { useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { IconArrowUpRight, IconChevronRight } from "@tabler/icons-react";
import { toast } from "sonner";
import { templateFor, type EmailConfig } from "@/lib/auth-config";
import { resetEmailTemplate, saveEmailTemplate } from "@/lib/auth-config-actions";
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
import { Empty } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";
import type { HtmlEditorHandle } from "./html-editor";

const HtmlEditor = dynamic(() => import("./html-editor"), {
  ssr: false,
  loading: () => <Skeleton className="h-80 w-full" />,
});

/**
 * One template, on its own page, as the original has it.
 *
 * Reads the whole Emails config rather than a part of its own: the subject, the body and the
 * customised flag are three fields of one response the list page already fetches, and a second
 * reader would be a second copy of the picking rules.
 */
export function TemplateEditor({ projectRef, templateKey }: { projectRef: string; templateKey: string }) {
  const template = templateFor(templateKey);
  const state = useProjectPart<EmailConfig>(projectRef, "auth-config");
  const refetch = useRefetchPart(projectRef, "auth-config");

  if (!template) return <Empty>That is not a template.</Empty>;

  const back = `/p/${projectRef}/auth/emails`;

  return (
    <div className="space-y-8">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href={back} className="hover:text-foreground">
          Emails
        </Link>
        <IconChevronRight className="size-3" aria-hidden />
        <span className="text-foreground">{template.label}</span>
      </nav>

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl text-foreground">{template.label}</h1>
          <p className="text-sm text-muted-foreground">{template.description}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href="https://supabase.com/docs/guides/auth/auth-email-templates" target="_blank" rel="noreferrer">
            Docs
            <IconArrowUpRight className="size-3.5" aria-hidden />
          </a>
        </Button>
      </header>

      {isWaiting(state) ? (
        <Skeleton className="h-96 w-full" />
      ) : state.status !== "ready" ? (
        <Empty>{reasonOf(state)}</Empty>
      ) : (
        <Form
          projectRef={projectRef}
          templateKey={template.key}
          label={template.label}
          variables={template.variables}
          saved={state.data.templates[template.key] ?? { subject: "", body: "", customised: false }}
          onSharedSender={state.data.smtpHost === null}
          onSaved={() => void refetch()}
        />
      )}
    </div>
  );
}

function Form({
  projectRef,
  templateKey,
  label,
  variables,
  saved,
  onSharedSender,
  onSaved,
}: {
  projectRef: string;
  templateKey: string;
  label: string;
  variables: readonly string[];
  saved: { subject: string; body: string; customised: boolean };
  onSharedSender: boolean;
  onSaved: () => void;
}) {
  const [subject, setSubject] = useState(saved.subject);
  const [body, setBody] = useState(saved.body);
  const [view, setView] = useState<"source" | "preview">("source");
  // Bumped when the document is replaced from outside — a reset — so the editor remounts with it.
  // The editor is uncontrolled, and pushing text into a live one would fight its undo history.
  const [revision, setRevision] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  // Which field a chip lands in. The body until the subject has been focused, because that is where
  // variables almost always go.
  const lastFocused = useRef<"subject" | "body">("body");
  const subjectInput = useRef<HTMLInputElement | null>(null);
  const editor = useRef<HtmlEditorHandle | null>(null);

  const dirty = subject !== saved.subject || body !== saved.body;

  const insert = (variable: string) => {
    const text = `{{ .${variable} }}`;

    if (lastFocused.current === "subject" && subjectInput.current) {
      const input = subjectInput.current;
      const from = input.selectionStart ?? subject.length;
      const to = input.selectionEnd ?? subject.length;
      setSubject(subject.slice(0, from) + text + subject.slice(to));
      // After React has written the new value, put the caret after what was inserted.
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(from + text.length, from + text.length);
      });
      return;
    }

    if (view !== "source") setView("source");
    // The editor may be mounting after the view switch; if so the chip lands on the next frame.
    requestAnimationFrame(() => editor.current?.insert(text));
  };

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

  const reset = () =>
    start(async () => {
      setError(null);
      const result = await resetEmailTemplate(projectRef, templateKey);
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      toast.success(`${label} reset to the default.`);
      setResetOpen(false);
      onSaved();
    });

  // A refetch after save or reset brings new saved values; take them, and remount the editor when
  // the body changed under it.
  const [seen, setSeen] = useState(saved);
  if (seen.subject !== saved.subject || seen.body !== saved.body) {
    setSeen(saved);
    setSubject(saved.subject);
    if (body !== saved.body) {
      setBody(saved.body);
      setRevision((r) => r + 1);
    }
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      <div className="space-y-2 p-5">
        <label htmlFor="template-subject" className="text-sm text-foreground">
          Subject
        </label>
        <Input
          id="template-subject"
          ref={subjectInput}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onFocus={() => (lastFocused.current = "subject")}
        />
      </div>

      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground">Body</span>
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            {(["source", "preview"] as const).map((option) => (
              <Button
                key={option}
                size="sm"
                variant={view === option ? "secondary" : "ghost"}
                className="h-7 capitalize"
                onClick={() => setView(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>

        {view === "source" ? (
          <HtmlEditor
            key={revision}
            initialValue={body}
            onChange={setBody}
            onFocus={() => (lastFocused.current = "body")}
            handleRef={editor}
          />
        ) : (
          // `sandbox=""`: this is a project's own template, but it is still markup from a text box,
          // and rendering it into the page would let it style — or script — the dashboard around it.
          <iframe
            title={`${label} preview`}
            srcDoc={body}
            sandbox=""
            className="h-80 w-full rounded-md border border-border bg-white"
          />
        )}

        <div className="space-y-2 pt-2">
          <div>
            <div className="text-sm text-foreground">Template variables</div>
            <p className="text-xs text-muted-foreground">
              Data placeholders that can be inserted into the subject or body.{" "}
              <a
                href="https://supabase.com/docs/guides/auth/auth-email-templates#terminology"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Learn more
              </a>
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {variables.map((variable) => (
              <Button
                key={variable}
                variant="outline"
                size="sm"
                className="h-7 rounded-full font-mono text-xs"
                // Keep the focus where it was, so the insertion knows which field it belongs in.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(variable)}
              >
                {`{{ .${variable} }}`}
              </Button>
            ))}
          </div>
        </div>

        {onSharedSender ? (
          // Measured 2026-09-26: on a free project using Supabase's shared sender, every template
          // write answers 400 "Email template modification is not available…". Said here, before the
          // save, rather than only after it.
          <p className="text-xs text-subtle">
            This project sends through Supabase&apos;s shared mail service. On the free plan that
            refuses template edits — set up SMTP first, or expect the save to be turned down.
          </p>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <div className="flex items-center justify-between p-4">
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !saved.customised}
          onClick={() => setResetOpen(true)}
        >
          Reset template
        </Button>
        <Button size="sm" disabled={busy || !dirty} onClick={save}>
          Save changes
        </Button>
      </div>

      <AlertDialog open={resetOpen} onOpenChange={(next) => !busy && setResetOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset {label.toLowerCase()} to the default?</AlertDialogTitle>
            <AlertDialogDescription>
              The subject and body are replaced with Supabase&apos;s own text. Whatever this template
              says now is not kept anywhere.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={busy} onClick={reset}>
              Reset template
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
