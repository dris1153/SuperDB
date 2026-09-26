import { strict as assert } from "node:assert";
import { afterEach, test } from "node:test";
import { MgmtError, listProjects, listSigningKeys, readOnlyQuery, restoreProject } from "./mgmt-api.ts";

const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
});

const replyWith = (status: number, body: string) => {
  globalThis.fetch = (async () =>
    new Response(body, { status })) as unknown as typeof globalThis.fetch;
};

test("a success with no body resolves instead of failing to parse nothing", async () => {
  // POST /restore answers 200 with an empty body. Calling json() on that threw "Unexpected end of
  // JSON input", which surfaced as a failure toast over a restore that had actually started.
  replyWith(200, "");
  await assert.doesNotReject(() => restoreProject("token", "abc"));
});

test("a success with a body is still parsed", async () => {
  replyWith(200, JSON.stringify([{ ref: "abc", name: "one" }]));
  const projects = await listProjects("token");
  assert.equal(projects[0].ref, "abc");
});

test("a query answers 201, and 201 is a success", async () => {
  // Measured 2026-09-12: the query endpoints answer 201, not 200, with the rows array and no
  // envelope. The SQL editor's run flow reads a non-2xx as "this statement failed", so a check on
  // `status === 200` anywhere in here would report every successful query as an error.
  replyWith(201, JSON.stringify([{ ok: 1 }]));
  assert.deepEqual(await readOnlyQuery("token", "abc", "select 1 as ok"), [{ ok: 1 }]);
});

test("a 204 carries no body either", async () => {
  globalThis.fetch = (async () =>
    new Response(null, { status: 204 })) as unknown as typeof globalThis.fetch;
  await assert.doesNotReject(() => restoreProject("token", "abc"));
});

test("a body that claims to be JSON but is not still fails", async () => {
  // Silence here would hide a genuine fault; only an empty body is treated as "nothing to read".
  replyWith(200, "<html>gateway error</html>");
  await assert.rejects(() => listProjects("token"));
});

test("a failure keeps the response body so the reason survives", async () => {
  const body = JSON.stringify({ message: "2 project limit" });
  replyWith(403, body);
  await assert.rejects(
    () => restoreProject("token", "abc"),
    (error: unknown) =>
      error instanceof MgmtError && error.status === 403 && error.message.includes(body),
  );
});

test("a long explanation reaches the error intact, JSON and all", async () => {
  // The cap here used to be 300, which severed the body mid-string; the reason then failed to parse
  // downstream and the toast read "Forbidden for this connection." instead of the actual problem.
  const message =
    "The following organization members have reached their maximum limits for the number of active free projects within organizations where they are an administrator or owner: dris1153 (2 project limit). To continue, these users will need to either delete, pause or upgrade one or more of these projects.";
  const body = JSON.stringify({ message });
  replyWith(403, body);
  await assert.rejects(
    () => restoreProject("token", "abc"),
    (error: unknown) => {
      assert.ok(error instanceof MgmtError);
      const json = error.message.slice(error.message.indexOf("{"));
      assert.equal((JSON.parse(json) as { message: string }).message, message);
      return true;
    },
  );
});

test("signing keys come wrapped in an object, and are unwrapped", async () => {
  // Measured 2026-09-25: this endpoint answers {keys: [...]} where /api-keys beside it answers a
  // bare array. A reader written from the neighbour's habit reads undefined and renders nothing.
  replyWith(200, JSON.stringify({ keys: [{ id: "a", algorithm: "ES256", status: "in_use" }] }));
  const keys = await listSigningKeys("token", "ref");
  assert.equal(keys[0].id, "a");
});

test("a bare array from this endpoint yields nothing rather than throwing", async () => {
  // The shape of the mistake: if the envelope is ever dropped, this is what arrives.
  replyWith(200, "[]");
  assert.deepEqual(await listSigningKeys("token", "ref"), []);
});
