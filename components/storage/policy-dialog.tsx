"use client";

import { useState, useTransition } from "react";
import { createStoragePolicy } from "@/lib/storage-policy-actions";
import {
  createPolicyStatement,
  POLICY_TEMPLATES,
  policyNameProblem,
  templateById,
} from "@/lib/storage-policies";
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
import type { Policy } from "@/lib/table-editor";
import { cn } from "@/lib/utils";

/**
 * Writing one policy for one bucket.
 *
 * Four shapes, not a policy editor. A policy is arbitrary SQL and a builder that tried to cover
 * that would be a worse SQL editor than the one this app already has — the link at the bottom goes
 * there for anything these do not say.
 *
 * **The statement shown is built by the same pure function the server runs**, from the template id
 * and the bucket name. It is a preview, not a payload: the server rebuilds it rather than executing
 * what this sent, which is the rule `lib/ddl-actions.ts` sets for every schema change in the app.
 */
export function NewPolicyDialog({
  open,
  onOpenChange,
  projectRef,
  bucket,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  projectRef: string;
  bucket: string;
  onCreated: () => void;
}) {
  const [templateId, setTemplateId] = useState<string>(POLICY_TEMPLATES[0].id);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setTemplateId(POLICY_TEMPLATES[0].id);
    setName("");
    setError(null);
  }

  // `templateId` only ever holds an id from the list, so this cannot miss.
  const template = templateById(templateId)!;
  const trimmed = name.trim();
  const problem = trimmed === "" ? null : policyNameProblem(trimmed);
  const preview = trimmed ? createPolicyStatement(template, bucket, trimmed) : null;

  const submit = () =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await createStoragePolicy(projectRef, templateId, bucket, trimmed);
        if (!result.ok) return setError(result.reason);
        onCreated();
        onOpenChange(false);
      } catch {
        setError("Could not reach the server.");
      }
    });

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent onEscapeKeyDown={(e) => pending && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>New policy on {bucket}</AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-subtle">
            Row level security on <span className="font-mono">storage.objects</span>, scoped to this
            bucket.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="policy-name" className="text-sm text-foreground">
              Policy name
            </label>
            <Input
              id="policy-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              placeholder="Anyone can read the catalog"
              autoComplete="off"
            />
            {problem ? <p className="text-xs text-warn">{problem}</p> : null}
          </div>

          <div className="space-y-2">
            {POLICY_TEMPLATES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setTemplateId(option.id)}
                disabled={pending}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-left transition-colors",
                  templateId === option.id
                    ? "border-foreground bg-muted"
                    : "border-border hover:bg-muted/60",
                )}
              >
                <div className="text-sm text-foreground">{option.label}</div>
                <div className="mt-0.5 text-xs text-subtle">{option.hint}</div>
              </button>
            ))}
          </div>

          {preview ? (
            <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] text-muted-foreground">
              {preview}
            </pre>
          ) : null}
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button disabled={pending || trimmed === "" || !!problem} onClick={submit}>
            {pending ? "Creating…" : "Create policy"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The confirm in front of dropping a policy.
 *
 * It exists because the direction is not obvious. Postgres ORs permissive policies and ANDs
 * restrictive ones, so removing a permissive policy takes access away while removing a restrictive
 * one **grants** it — and a trash icon reads as "make this safer" either way.
 */
export function DropPolicyConfirm({
  open,
  onOpenChange,
  policy,
  table,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  policy: Policy | null;
  table: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent onEscapeKeyDown={(e) => busy && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Drop {policy?.name ?? "this policy"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p className="text-subtle">
                On <span className="font-mono">storage.{table}</span>, for{" "}
                <span className="font-mono">{policy?.command}</span>
                {policy?.roles ? ` to ${policy.roles}` : null}.
              </p>

              {policy && !policy.permissive ? (
                <p className="text-warn">
                  This is a <span className="font-mono">RESTRICTIVE</span> policy. Postgres applies
                  those as limits on top of everything else, so dropping it **widens** access rather
                  than narrowing it.
                </p>
              ) : (
                <p className="text-subtle">
                  Anything relying on this policy for access loses it immediately.
                </p>
              )}

              {policy?.using_expr ? (
                <pre className="overflow-x-auto rounded-md border border-border bg-background p-2 font-mono text-[11px] text-muted-foreground">
                  {policy.using_expr}
                </pre>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {busy ? "Dropping…" : "Drop policy"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
