"use client";

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * What the editor looks like.
 *
 * `{ dark: true }` is the part that matters. Without it CodeMirror applies its `&light` rules — a
 * `#f5f5f5` gutter and a `#cceeff44` active line, both straight out of `@codemirror/view` — which on
 * this app's `#121212` background is a white stripe down the side and a pale blue bar across the
 * middle. That, not the choice of editor, was what looked wrong.
 *
 * Colours come from the app's own tokens so the editor is the same surface as everything around it,
 * and the syntax palette is `github-dark-default` — the theme `lib/highlight.ts` already gives Shiki.
 * SQL therefore reads identically here and in the table editor's Definition tab. The values below
 * were read out of the installed theme rather than typed from memory.
 */
export const FOREGROUND = "#e6edf3";
const COMMENT = "#8b949e";
export const KEYWORD = "#ff7b72";
const STRING = "#a5d6ff";
const CONSTANT = "#79c0ff";
const FUNCTION = "#d2a8ff";
const VARIABLE = "#ffa657";

export const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "0.8125rem",
      color: "var(--foreground)",
      backgroundColor: "transparent",
    },
    // The editor sits inside a pane that already draws its own border, and a focus ring on top of
    // that reads as a second box rather than as focus.
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "var(--font-mono, ui-monospace, monospace)", lineHeight: "1.6" },
    ".cm-content": { caretColor: "var(--primary)" },

    ".cm-gutters": {
      backgroundColor: "var(--card)",
      color: "var(--color-subtle)",
      border: "none",
      borderRight: "1px solid var(--border)",
    },
    ".cm-activeLineGutter": { backgroundColor: "var(--muted)", color: "var(--foreground)" },
    ".cm-activeLine": { backgroundColor: "color-mix(in oklab, var(--muted) 55%, transparent)" },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--muted)",
      border: "1px solid var(--border)",
      color: "var(--color-subtle)",
    },

    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--primary)" },
    // Both selectors: CodeMirror draws its own selection layer when the editor is focused and falls
    // back to the browser's when it is not, and only styling one leaves the other invisible.
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "color-mix(in oklab, var(--primary) 28%, transparent)",
    },
    ".cm-selectionMatch": { backgroundColor: "color-mix(in oklab, var(--primary) 16%, transparent)" },
    "&.cm-focused .cm-matchingBracket": {
      backgroundColor: "color-mix(in oklab, var(--primary) 22%, transparent)",
      outline: "none",
    },
    ".cm-placeholder": { color: "var(--color-subtle)", fontStyle: "normal" },

    ".cm-tooltip": {
      backgroundColor: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "6px",
      color: "var(--foreground)",
      fontSize: "0.75rem",
    },
    ".cm-tooltip .cm-tooltip-arrow:before": { borderTopColor: "var(--border)", borderBottomColor: "var(--border)" },
    ".cm-tooltip .cm-tooltip-arrow:after": { borderTopColor: "var(--card)", borderBottomColor: "var(--card)" },
    ".cm-tooltip-autocomplete > ul > li": { padding: "2px 6px" },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--muted)",
      color: "var(--foreground)",
    },
    ".cm-completionIcon": { color: "var(--color-subtle)" },
    ".cm-diagnostic-error": { borderLeftColor: "var(--destructive)" },

    ".cm-panels": { backgroundColor: "var(--card)", color: "var(--foreground)" },
    ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--border)" },
    ".cm-searchMatch": { backgroundColor: "color-mix(in oklab, var(--color-warn) 30%, transparent)" },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "color-mix(in oklab, var(--primary) 35%, transparent)",
    },
  },
  { dark: true },
);

const highlightStyle = HighlightStyle.define([
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: COMMENT, fontStyle: "italic" },
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword], color: KEYWORD },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: STRING },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.constant(tags.name)], color: CONSTANT },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: FUNCTION },
  { tag: [tags.typeName, tags.className, tags.namespace], color: CONSTANT },
  { tag: [tags.variableName, tags.propertyName, tags.attributeName], color: VARIABLE },
  { tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket], color: FOREGROUND },
  { tag: tags.invalid, color: "var(--destructive)" },
]);

/**
 * Placed before `basicSetup` by the caller: it ships `defaultHighlightStyle`, which is tuned for a
 * light background, and in CodeMirror the earlier extension wins.
 */
export const editorHighlighting = syntaxHighlighting(highlightStyle);
