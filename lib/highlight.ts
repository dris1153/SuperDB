import "server-only";
import { createHighlighter, type Highlighter } from "shiki";

/**
 * Syntax highlighting happens on the server: the browser receives finished HTML and never downloads
 * Shiki's WASM or grammars. Same trade as the region flags.
 *
 * A single highlighter is created lazily and reused — createHighlighter loads grammars, so calling
 * it per snippet would repeat that work on every request.
 */
export type Lang = "bash" | "html" | "ini" | "javascript" | "json" | "sql" | "tsx" | "typescript";

const LANGS: Lang[] = ["bash", "html", "ini", "javascript", "json", "sql", "tsx", "typescript"];
const THEME = "github-dark-default";

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({ themes: [THEME], langs: LANGS });
  return highlighterPromise;
}

/**
 * Returns highlighted HTML, or null if highlighting fails — the caller renders plain text instead.
 * A snippet nobody can read is worse than an unstyled one.
 */
export async function highlight(code: string, lang: Lang): Promise<string | null> {
  try {
    const highlighter = await getHighlighter();
    return highlighter.codeToHtml(code, {
      lang,
      theme: THEME,
      // The theme's own background would fight the card surface; the wrapper supplies it.
      colorReplacements: { "#0d1117": "transparent" },
    });
  } catch {
    return null;
  }
}
