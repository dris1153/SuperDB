"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { html } from "@codemirror/lang-html";
import { basicSetup } from "codemirror";
import { editorHighlighting, editorTheme } from "@/components/sql-editor/editor-theme";

export type HtmlEditorHandle = {
  /** Replaces the selection — or inserts at the caret — and keeps the focus in the editor. */
  insert: (text: string) => void;
};

/**
 * An email template's body, as HTML with line numbers.
 *
 * The same construction as `components/sql-editor/editor.tsx`, and deliberately so: that file
 * solved the dark theme, the highlight precedence and the uncontrolled-document question once, and
 * this reuses its theme rather than solving them again.
 *
 * **Uncontrolled.** Re-creating the state on every keystroke would throw away the selection, the
 * undo history and the scroll. The document belongs to the editor; `onChange` reports it outward.
 * A caller that needs to replace the document wholesale — after a reset — remounts it with a new
 * `key` rather than pushing text into a live editor.
 *
 * Default-exported for `next/dynamic`, so `@codemirror/lang-html` rides on this route and no other.
 */
export default function HtmlEditor({
  initialValue,
  onChange,
  onFocus,
  handleRef,
}: {
  initialValue: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  /**
   * Filled in on mount, so a variable chip can insert at the caret without owning the editor. The
   * `Ref` suffix is load-bearing: React's compiler refuses writes to a prop's `.current` unless the
   * name says it is a ref.
   */
  handleRef: MutableRefObject<HtmlEditorHandle | null>;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ onChange, onFocus });
  const first = useRef(initialValue);

  useEffect(() => {
    latest.current = { onChange, onFocus };
  });

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;

    const editor = new EditorView({
      parent,
      state: EditorState.create({
        doc: first.current,
        extensions: [
          // Before basicSetup, which ships a highlight style meant for a light background: in
          // CodeMirror the earlier extension wins.
          editorHighlighting,
          basicSetup,
          html(),
          // Wrapped rather than scrolled sideways: an email body is mostly prose in tags, and a
          // paragraph on one 400-character line is unreadable. The document is unchanged by it.
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current.onChange(update.state.doc.toString());
            if (update.focusChanged && update.view.hasFocus) latest.current.onFocus();
          }),
          editorTheme,
        ],
      }),
    });

    handleRef.current = {
      insert: (text) => {
        editor.dispatch(editor.state.replaceSelection(text));
        editor.focus();
      },
    };

    return () => {
      handleRef.current = null;
      editor.destroy();
    };
  }, [handleRef]);

  return <div ref={host} className="h-80 overflow-hidden rounded-md border border-border" />;
}
