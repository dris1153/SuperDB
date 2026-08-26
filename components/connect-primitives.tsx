"use client";

import { useState, type ReactNode } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import type { GuideStep } from "@/lib/guide-steps";
import { Button } from "./ui/button";

/** Shared by every Connect panel. Kept out of connect-sheet.tsx so the panels can import it. */
export function Copyable({
  value,
  label,
  className,
}: {
  value: string;
  /** Turns the icon button into a labelled one. */
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size={label ? "sm" : "icon-sm"}
      aria-label={label ?? "Copy"}
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Denied outside a secure context; the value stays selectable on screen.
        }
      }}
    >
      {copied ? (
        <IconCheck size={13} stroke={1.5} className="text-primary" />
      ) : (
        <IconCopy size={13} stroke={1.5} />
      )}
      {label}
    </Button>
  );
}

export function Snippet({ value }: { value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-background p-2.5">
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-xs whitespace-pre text-muted-foreground">
        {value}
      </code>
      <Copyable value={value} />
    </div>
  );
}

export function Step({
  index,
  title,
  description,
  children,
}: {
  index: number;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <div className="flex gap-2.5">
        <span className="flex size-5 bg-background shrink-0 items-center justify-center rounded border border-border text-[11px] text-subtle">
          {index}
        </span>
        <div>
          <div className="text-sm text-foreground">{title}</div>
          <p className="mt-0.5 text-xs leading-relaxed text-subtle">
            {description}
          </p>
        </div>
      </div>
      <div className="min-w-0 space-y-2">{children}</div>
    </div>
  );
}

export function CodeBlock({ html, code }: { html: string | null; code: string }) {
  return html ? (
    <div
      className="overflow-x-auto rounded-md border border-border bg-background p-2.5 text-xs [&_pre]:!bg-transparent"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  ) : (
    <pre className="overflow-x-auto rounded-md border border-border bg-background p-2.5 font-mono text-xs text-muted-foreground">
      {code}
    </pre>
  );
}

function Block({ html, code }: { html: string | null; code: string }) {
  return (
    <div className="relative">
      <CodeBlock html={html} code={code} />
      <Copyable value={code} className="absolute top-1.5 right-1.5" />
    </div>
  );
}

/**
 * Named files go behind underline tabs, matching Supabase's file switcher. Unnamed ones are
 * commands rather than files, so they stack — an ORM install step is two lines to run in order,
 * not two things to choose between.
 */
export function StepFiles({ step }: { step: GuideStep }) {
  const [active, setActive] = useState(0);
  const named = step.files.some((f) => f.name);

  if (!named) {
    return (
      <>
        {step.files.map((f, index) => (
          <Block key={index} html={f.html} code={f.code} />
        ))}
      </>
    );
  }

  const file = step.files[Math.min(active, step.files.length - 1)];

  return (
    <>
      <div className="flex gap-3 overflow-x-auto border-b border-border">
        {step.files.map((f, index) => (
          <button
            key={f.name}
            onClick={() => setActive(index)}
            className={`-mb-px shrink-0 border-b px-0.5 pb-1.5 font-mono text-xs transition-colors ${
              index === active
                ? "border-foreground text-foreground"
                : "border-transparent text-subtle hover:text-muted-foreground"
            }`}
          >
            {f.name}
          </button>
        ))}
      </div>

      <Block html={file.html} code={file.code} />

      {step.link ? (
        <p className="text-xs text-subtle">
          Add UI components for auth, realtime, storage, and more at{" "}
          <a
            href={step.link.href}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            {step.link.text}
          </a>
          .
        </p>
      ) : null}
    </>
  );
}
