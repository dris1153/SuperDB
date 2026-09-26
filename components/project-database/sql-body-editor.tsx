"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { basicSetup } from "codemirror";
import { editorHighlighting, editorTheme } from "@/components/sql-editor/editor-theme";
import { cn } from "@/lib/utils";

/**
 * A function's body, as SQL with line numbers — the email template editor's construction with the
 * SQL editor's language. Uncontrolled: a caller that replaces the document remounts it with a `key`.
 * Default-exported for `next/dynamic`, so CodeMirror stays on the routes that open it.
 */
export default function SqlBodyEditor({
  initialValue,
  onChange,
  className = "h-80 border-y border-border",
}: {
  initialValue: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const latest = useRef(onChange);
  const first = useRef(initialValue);

  useEffect(() => {
    latest.current = onChange;
  });

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const editor = new EditorView({
      parent,
      state: EditorState.create({
        doc: first.current,
        extensions: [
          // Before basicSetup, whose own highlight style is meant for a light background.
          editorHighlighting,
          basicSetup,
          sql({ dialect: PostgreSQL }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current(update.state.doc.toString());
          }),
          editorTheme,
        ],
      }),
    });
    return () => editor.destroy();
  }, []);

  return <div ref={host} className={cn("overflow-hidden", className)} />;
}
