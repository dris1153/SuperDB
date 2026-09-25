/**
 * One line of `JSON.stringify(value, null, 2)`, taken apart for colouring.
 *
 * Pure, and separate from the component, because the risk here is not layout: a tokeniser that
 * mangles a value would make the Raw JSON tab lie about the record it exists to show. This is the
 * part that can be tested.
 *
 * It reads a *line of that exact output*, not arbitrary JSON — which is what makes it small. At two
 * spaces of indentation a line holds either a key and a value, or a bracket, or a bare element, and
 * a string value is already escaped by `JSON.stringify`.
 */
export type JsonLine =
  | { kind: "pair"; indent: string; key: string; separator: string; value: string; comma: boolean }
  | { kind: "plain"; text: string };

const PAIR = /^(\s*)("(?:[^"\\]|\\.)*")(\s*:\s*)(.*)$/;

export function splitLine(text: string): JsonLine {
  const found = PAIR.exec(text);
  if (!found) return { kind: "plain", text };

  const [, indent, key, separator, rest] = found;

  // The trailing comma belongs to the document, not to the value — and a comma *inside* a string
  // must not be mistaken for it, which is why this looks at the last character rather than splitting
  // on one.
  const comma = rest.endsWith(",");

  return {
    kind: "pair",
    indent,
    key,
    separator,
    value: comma ? rest.slice(0, -1) : rest,
    comma,
  };
}

export type ValueKind = "string" | "number" | "boolean" | "null" | "other";

/** What a value is, for the colour it gets. Anything unrecognised is left uncoloured rather than guessed. */
export function valueKind(value: string): ValueKind {
  if (value.startsWith('"')) return "string";
  if (value === "null") return "null";
  if (value === "true" || value === "false") return "boolean";
  return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value) ? "number" : "other";
}
