import { strict as assert } from "node:assert";
import { test } from "node:test";
import { splitLine, valueKind } from "./json-line.ts";

const pair = (text: string) => {
  const line = splitLine(text);
  assert.equal(line.kind, "pair", `expected a pair: ${text}`);
  return line as Extract<ReturnType<typeof splitLine>, { kind: "pair" }>;
};

test("a line keeps its value exactly, or the tab lies about the record", () => {
  // Reassembling must give back the line character for character — that is the whole contract.
  for (const text of [
    '  "email": "okay7290@gmail.com",',
    '  "banned_until": null,',
    '  "created_at": "2026-08-25T02:40:19.570495+00:00",',
    '    "avatar_url": "https://avatars.githubusercontent.com/u/64675438?v=4",',
    '  "email_verified": true',
    '  "count": -12.5,',
  ]) {
    const line = pair(text);
    assert.equal(line.indent + line.key + line.separator + line.value + (line.comma ? "," : ""), text);
  }
});

test("a value that contains the separator is not split on it", () => {
  // `": "` inside a URL or a message is the obvious way to mangle one of these.
  const line = pair('  "iss": "https://api.github.com",');
  assert.equal(line.key, '"iss"');
  assert.equal(line.value, '"https://api.github.com"');

  const message = pair('  "msg": "request completed: 200, ok",');
  assert.equal(message.value, '"request completed: 200, ok"');
  assert.equal(message.comma, true, "the document's comma, not the one inside the string");
});

test("an escaped quote inside a key does not end it", () => {
  const line = pair('  "a\\"b": 1');
  assert.equal(line.key, '"a\\"b"');
  assert.equal(line.value, "1");
});

test("a line that is not a pair is left alone", () => {
  for (const text of ["{", "}", "  ],", '    "github"', ""]) {
    const line = splitLine(text);
    assert.equal(line.kind, "plain");
    assert.equal(line.kind === "plain" && line.text, text);
  }
});

test("values are recognised, and anything else is left uncoloured", () => {
  assert.equal(valueKind('"github"'), "string");
  assert.equal(valueKind("null"), "null");
  assert.equal(valueKind("true"), "boolean");
  assert.equal(valueKind("false"), "boolean");
  assert.equal(valueKind("64675438"), "number");
  assert.equal(valueKind("-12.5"), "number");
  assert.equal(valueKind("1.5e-9"), "number");

  // Openers and anything unfamiliar: uncoloured rather than guessed at.
  assert.equal(valueKind("{"), "other");
  assert.equal(valueKind("["), "other");
  assert.equal(valueKind("2026-08-25"), "other", "a bare date is not a number");
});
