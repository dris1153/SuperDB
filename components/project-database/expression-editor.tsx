"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, highlightActiveLineGutter, lineNumbers, placeholder } from "@codemirror/view";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { minimalSetup } from "codemirror";
import { editorHighlighting, editorTheme } from "@/components/sql-editor/editor-theme";

/**
 * One expression inside the policy frame: grows with its text, and numbers its lines on from the
 * frame's fixed lines above it, as the original's single editor does. Uncontrolled — a template
 * remounts it with a new `key`. Default-exported for `next/dynamic`.
 */
export default function ExpressionEditor({
  initialValue,
  onChange,
  firstLine,
  hint,
}: {
  initialValue: string;
  onChange: (value: string) => void;
  firstLine: number;
  hint: string;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const latest = useRef(onChange);
  const first = useRef({ initialValue, firstLine, hint });

  useEffect(() => {
    latest.current = onChange;
  });

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const { initialValue: doc, firstLine: offset, hint: text } = first.current;
    const editor = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [
          editorHighlighting,
          minimalSetup,
          lineNumbers({ formatNumber: (n) => String(n + offset - 1) }),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          placeholder(text),
          sql({ dialect: PostgreSQL }),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current(update.state.doc.toString());
          }),
          editorTheme,
        ],
      }),
    });
    return () => editor.destroy();
  }, []);

  return <div ref={host} className="border-y border-border" />;
}
