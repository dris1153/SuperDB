import { strict as assert } from "node:assert";
import { test, beforeEach } from "node:test";
import {
  PROJECTS_TTL_MS,
  forgetAllProjects,
  forgetConnectionProjects,
  projectsForConnection,
  type ConnectionProjects,
} from "./projects-memo.ts";

beforeEach(() => forgetAllProjects());

const answer = (name: string): ConnectionProjects => ({
  projects: [
    {
      ref: name,
      name,
      region: "ap-southeast-2",
      created_at: "2026-09-26T00:00:00Z",
      organization_slug: name,
      status: "ACTIVE_HEALTHY",
    },
  ],
  orgs: [{ id: name, slug: name, name }],
});

/** A loader that records how often it was asked, so a hit and a miss can be told apart. */
function counting(name: string) {
  let calls = 0;
  return {
    load: async () => {
      calls += 1;
      return answer(name);
    },
    get calls() {
      return calls;
    },
  };
}

test("two connections never share an entry", async () => {
  // The failure this module is built around: one Supabase account's project list served to another.
  const a = counting("account-a");
  const b = counting("account-b");

  const first = await projectsForConnection("conn-a", a.load, 0);
  const second = await projectsForConnection("conn-b", b.load, 0);

  assert.equal(first.projects[0].name, "account-a");
  assert.equal(second.projects[0].name, "account-b");
  assert.equal(a.calls, 1);
  assert.equal(b.calls, 1, "the second connection was not answered from the first's entry");

  // And again, now that both are warm.
  assert.equal((await projectsForConnection("conn-a", a.load, 1)).projects[0].name, "account-a");
  assert.equal((await projectsForConnection("conn-b", b.load, 1)).projects[0].name, "account-b");
  assert.equal(a.calls, 1);
  assert.equal(b.calls, 1);
});

test("a second read inside the window does not call upstream", async () => {
  const c = counting("one");

  await projectsForConnection("conn", c.load, 0);
  await projectsForConnection("conn", c.load, PROJECTS_TTL_MS - 1);

  assert.equal(c.calls, 1);
});

test("an entry older than the window is refetched", async () => {
  const c = counting("one");

  await projectsForConnection("conn", c.load, 0);
  await projectsForConnection("conn", c.load, PROJECTS_TTL_MS);

  assert.equal(c.calls, 2, "exactly at the boundary is already stale");
});

test("a failed load is not remembered", async () => {
  // A connection whose token has expired should retry on the next navigation rather than be told it
  // has no projects for the rest of the window.
  let calls = 0;
  const failing = async (): Promise<ConnectionProjects> => {
    calls += 1;
    throw new Error("token expired");
  };

  await assert.rejects(() => projectsForConnection("conn", failing, 0), /token expired/);
  await assert.rejects(() => projectsForConnection("conn", failing, 1), /token expired/);
  assert.equal(calls, 2);
});

test("a stale entry is dropped before the refetch, not after it succeeds", async () => {
  const good = counting("one");
  await projectsForConnection("conn", good.load, 0);

  const failing = async (): Promise<ConnectionProjects> => {
    throw new Error("upstream down");
  };
  await assert.rejects(() => projectsForConnection("conn", failing, PROJECTS_TTL_MS), /upstream down/);

  // The expired entry must not still be sitting there after the failure.
  const after = counting("two");
  assert.equal((await projectsForConnection("conn", after.load, PROJECTS_TTL_MS)).projects[0].name, "two");
});

test("forgetting one connection leaves the others alone", async () => {
  const a = counting("account-a");
  const b = counting("account-b");
  await projectsForConnection("conn-a", a.load, 0);
  await projectsForConnection("conn-b", b.load, 0);

  forgetConnectionProjects("conn-a");

  await projectsForConnection("conn-a", a.load, 1);
  await projectsForConnection("conn-b", b.load, 1);

  assert.equal(a.calls, 2, "the forgotten one was read again");
  assert.equal(b.calls, 1, "the other was not");
});

test("the map is bounded, and drops the oldest rather than everything", async () => {
  // One person with many connections must not flush everyone else's and send them all back to a
  // throttled API.
  for (let i = 0; i < 120; i++) {
    await projectsForConnection(`conn-${i}`, counting(`n-${i}`).load, i);
  }

  const recent = counting("recent-again");
  await projectsForConnection("conn-119", recent.load, 120);
  assert.equal(recent.calls, 0, "the newest entry survived the eviction");

  const oldest = counting("oldest-again");
  await projectsForConnection("conn-0", oldest.load, 121);
  assert.equal(oldest.calls, 1, "the oldest did not");
});
