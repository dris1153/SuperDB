"use client";

import { Button } from "@/components/ui/button";

/**
 * The project routes' boundary.
 *
 * Their panels render whatever the read endpoints return, and those bodies are typed by hand against
 * an API this app does not control — a shape that changed upstream throws inside a panel's render.
 * Without a boundary that takes the whole route down, including the shell the client-fetching work
 * exists to paint.
 *
 * The message is not shown: a render error's text is a stack-adjacent detail in development and a
 * digest in production, and neither is something to put in front of someone.
 */
export default function ProjectError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md p-8">
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-foreground">This page could not be displayed.</p>
        <p className="mt-1 text-xs text-subtle">
          The project is not affected — this is the dashboard failing to render what it was given.
        </p>
        <Button size="sm" className="mt-4" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
