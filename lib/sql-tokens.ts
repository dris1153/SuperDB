/**
 * SQL split into coloured pieces, in the browser.
 *
 * **Why this exists rather than Shiki.** `lib/highlight.ts` is `server-only`, and importing it from
 * `lib/project-parts.ts` for one reader out of twenty put Shiki's grammars on the route every card
 * and the user panel call: measured 2026-09-26, 12.7 MB and 588 traced files, against 2.0 MB and 107
 * without it. A dynamic import does not help — Next's file tracer follows `import()` too, which
 * `plans/260926-0153-cold-start/phase-01` measured the hard way.
 *
 * **The contract is reassembly, not colour.** This renders DDL somebody will copy and run, so the
 * tokens must join back into the original text character for character. Every test holds it to that
 * before it checks a single kind. A tokeniser that loses a quote here produces SQL that does
 * something else.
 *
 * It reads the DDL this app generates — `lib/table-ddl.ts` — not SQL in general. Anything it does
 * not recognise comes back as `plain`, which is uncoloured and still exactly the input.
 */
export type SqlTokenKind = "keyword" | "string" | "comment" | "number" | "quoted" | "plain";

export type SqlToken = { kind: SqlTokenKind; text: string };

/**
 * Words the generated DDL uses. Not the whole of SQL: a keyword list that guesses is how `name` or
 * `value` ends up coloured as syntax in somebody's column list.
 */
const KEYWORDS = new Set([
  "add", "all", "alter", "and", "array", "as", "asc", "begin", "bigint", "boolean", "by", "cascade",
  "check", "collate", "column", "commit", "constraint", "create", "current_timestamp", "date",
  "default", "definer", "delete", "desc", "distinct", "do", "double", "drop", "enable", "end", "exists",
  "false", "for", "foreign", "from", "function", "generated", "grant", "group", "having", "identity",
  "if", "in", "index", "insert", "int", "integer", "interval", "into", "is", "join", "jsonb", "key", "language",
  "level", "like", "limit", "not", "null", "numeric", "on", "or", "order", "policy", "precision",
  "primary", "procedure", "references", "replace", "returns", "revoke", "row", "schema", "security", "select",
  "sequence", "set", "setof", "smallint", "stable", "table", "text", "then", "time", "timestamp", "timestamptz", "to",
  "trigger", "true", "type", "unique", "update", "using", "uuid", "values", "varchar", "view",
  "when", "where", "with", "without", "zone",
]);

/**
 * One pass, left to right, never backtracking.
 *
 * Order matters: a comment can contain a quote, a string can contain two dashes, and a quoted
 * identifier can contain either. Whichever opens first wins, and it runs to its own close.
 */
export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let plain = "";

  const flush = () => {
    if (plain) tokens.push({ kind: "plain", text: plain });
    plain = "";
  };

  const push = (kind: SqlTokenKind, text: string) => {
    flush();
    tokens.push({ kind, text });
  };

  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);

    // `-- to the end of the line`, newline excluded so the line structure stays plain.
    if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      push("comment", sql.slice(i, stop));
      i = stop;
      continue;
    }

    if (rest.startsWith("/*")) {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      push("comment", sql.slice(i, stop));
      i = stop;
      continue;
    }

    // A string literal, where '' is an escaped quote rather than the end of one.
    if (rest.startsWith("'")) {
      const stop = closingQuote(sql, i, "'");
      push("string", sql.slice(i, stop));
      i = stop;
      continue;
    }

    // A quoted identifier, same doubling rule. Postgres needs these whenever a name is not lower
    // case, which `quoteIdent` produces constantly.
    if (rest.startsWith('"')) {
      const stop = closingQuote(sql, i, '"');
      push("quoted", sql.slice(i, stop));
      i = stop;
      continue;
    }

    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (word) {
      const text = word[0];
      if (KEYWORDS.has(text.toLowerCase())) push("keyword", text);
      else plain += text;
      i += text.length;
      continue;
    }

    const number = /^\d+(\.\d+)?/.exec(rest);
    if (number) {
      push("number", number[0]);
      i += number[0].length;
      continue;
    }

    plain += sql[i];
    i += 1;
  }

  flush();
  return tokens;
}

/**
 * Where the quote that opened at `start` closes, past the end of the string if it never does.
 *
 * An unterminated quote is possible — this renders whatever the server built, and a truncated DDL
 * is one of the states `tableDefinition` reports. Running to the end keeps the text intact instead
 * of dropping the remainder.
 */
function closingQuote(sql: string, start: number, quote: string): number {
  let i = start + 1;

  while (i < sql.length) {
    if (sql[i] !== quote) {
      i += 1;
      continue;
    }
    // Doubled: part of the value, not the end of it.
    if (sql[i + 1] === quote) {
      i += 2;
      continue;
    }
    return i + 1;
  }

  return sql.length;
}
