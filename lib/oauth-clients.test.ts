import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  authMethodFor,
  clientNameProblem,
  clientsFrom,
  isClientType,
  redirectUriProblem,
  sortClients,
  type OAuthClient,
} from "./oauth-clients.ts";

test("an empty project answers with no list at all", () => {
  // Measured: `{}` when there are none, `{clients: [...]}` when there are. This is the trap
  // `listSigningKeys` has a test for, arriving a second time.
  assert.deepEqual(clientsFrom({}), []);
  assert.deepEqual(clientsFrom({ clients: [] }), []);
  assert.equal(clientsFrom({ clients: [{ client_id: "a" }] }).length, 1);

  // And the shapes that are not the answer at all.
  assert.deepEqual(clientsFrom(null), []);
  assert.deepEqual(clientsFrom([]), [], "a bare array has no .clients");
  assert.deepEqual(clientsFrom({ clients: "two" }), []);
});

test("the auth method follows the client type rather than being chosen", () => {
  assert.equal(authMethodFor("confidential"), "client_secret_basic");
  assert.equal(authMethodFor("public"), "none");
  assert.equal(isClientType("confidential"), true);
  assert.equal(isClientType("secret"), false);
  assert.equal(isClientType(null), false);
});

test("a redirect URI has to be a URL that a browser would go to", () => {
  assert.equal(redirectUriProblem(["https://example.com/cb"]), null);
  // http stays allowed: local development needs it.
  assert.equal(redirectUriProblem(["http://localhost:3000/cb"]), null);

  assert.match(redirectUriProblem([]) ?? "", /At least one/);
  assert.match(redirectUriProblem(["not a url"]) ?? "", /is not a URL/);
  assert.match(redirectUriProblem(["javascript:alert(1)"]) ?? "", /not an http or https/);
  assert.match(redirectUriProblem(["  "]) ?? "", /cannot be blank/);
  assert.match(
    redirectUriProblem(Array.from({ length: 11 }, (_, i) => `https://e.com/${i}`)) ?? "",
    /At most 10/,
  );
});

test("a name is required and bounded", () => {
  assert.equal(clientNameProblem("My app"), null);
  assert.match(clientNameProblem("") ?? "", /required/);
  assert.match(clientNameProblem("   ") ?? "", /required/);
  assert.match(clientNameProblem(null) ?? "", /required/);
  assert.match(clientNameProblem("x".repeat(101)) ?? "", /too long/);
});

test("clients are listed newest first, whatever order they arrive in", () => {
  const client = (id: string, created: string) =>
    ({ client_id: id, client_type: "confidential", created_at: created }) as OAuthClient;

  const sorted = sortClients([
    client("old", "2026-01-01T00:00:00Z"),
    client("new", "2026-09-01T00:00:00Z"),
    client("middle", "2026-05-01T00:00:00Z"),
  ]);

  assert.deepEqual(
    sorted.map((c) => c.client_id),
    ["new", "middle", "old"],
  );
});
