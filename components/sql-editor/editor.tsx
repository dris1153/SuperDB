"use client";

import { useEffect, useRef } from "react";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { setDiagnostics } from "@codemirror/lint";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { basicSetup } from "codemirror";
import type { SqlError } from "@/lib/sql-error";
import { editorHighlighting, editorTheme } from "./editor-theme";

/**
 * CodeMirror 6, mounted once and driven by effects.
 *
 * Deliberately not a controlled component. Re-creating the state on every keystroke would throw
 * away the selection, the undo history and the scroll position — the document belongs to the
 * editor, and `onChange` reports it outward.
 *
 * Default-exported so `next/dynamic` can pull it, and the ~200KB of editor stays off every other
 * route. Nothing else in the app imports it.
 */
export default function SqlCodeEditor({
  initialValue,
  onChange,
  onRun,
  error,
}: {
  initialValue: string;
  onChange: (sql: string) => void;
  /** Mod-Enter. Reads the handler through a ref, so the keymap never goes stale. */
  onRun: () => void;
  /** Underlined in place when it carries a position. */
  error: SqlError | null;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef({ onChange, onRun });
  const first = useRef(initialValue);

  useEffect(() => {
    latest.current = { onChange, onRun };
  });

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;

    const editor = new EditorView({
      parent,
      state: EditorState.create({
        doc: first.current,
        extensions: [
          // Highest precedence, because basicSetup's default keymap binds Mod-Enter to
          // insertBlankLine — without this, the shortcut splits the line instead of running.
          Prec.highest(
            keymap.of([
              { key: "Mod-Enter", preventDefault: true, run: () => (latest.current.onRun(), true) },
            ]),
          ),
          // Before basicSetup, which ships defaultHighlightStyle for a light background: in
          // CodeMirror the earlier extension wins.
          editorHighlighting,
          basicSetup,
          sql({ dialect: PostgreSQL }),
          placeholder("Write SQL here. Ctrl/Cmd + Enter runs it."),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current.onChange(update.state.doc.toString());
          }),
          editorTheme,
        ],
      }),
    });

    view.current = editor;
    editor.focus();
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);

  /**
   * The buffer arrives from `sessionStorage` through `useSyncExternalStore`, and this component is
   * loaded on demand — so on a reload it is possible for the editor to mount before the stored text
   * has reached it, with nothing afterwards to put it there. Filling an empty document closes that
   * without ever touching one being typed in.
   */
  useEffect(() => {
    const editor = view.current;
    if (!editor || initialValue === "" || editor.state.doc.length > 0) return;
    editor.dispatch({ changes: { from: 0, insert: initialValue } });
  }, [initialValue]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const found = error && spot(editor.state, error);
    editor.dispatch(
      setDiagnostics(
        editor.state,
        found ? [{ ...found, severity: "error", message: label(error) }] : [],
      ),
    );
  }, [error]);

  return <div ref={host} className="h-full overflow-hidden" data-testid="sql-editor" />;
}

const label = (error: SqlError) =>
  error.sqlstate ? `${error.sqlstate}: ${error.text}` : error.text;

/**
 * Postgres reports 1-based line and column; CodeMirror counts document offsets. A stale position —
 * an error from the previous run against an edited document — is clamped rather than dropped, since
 * the message still belongs somewhere.
 */
function spot(state: EditorState, error: SqlError): { from: number; to: number } | null {
  if (error.line == null) return null;

  const line = state.doc.line(Math.min(Math.max(error.line, 1), state.doc.lines));
  const from = Math.min(line.from + Math.max((error.column ?? 1) - 1, 0), line.to);
  // The caret marks where the token starts, not how long it is; the word under it is the token.
  const word = state.wordAt(from);
  return { from, to: Math.max(word ? word.to : Math.min(from + 1, line.to), from) };
}
