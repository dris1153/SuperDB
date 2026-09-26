import assert from "node:assert/strict";
import test from "node:test";
import { dashboardUrl } from "./dashboard-url.ts";

const ref = "abcdefghijklmnopqrst";
const at = (path: string) => dashboardUrl(ref, `/p/${ref}${path}`);
const home = `https://supabase.com/dashboard/project/${ref}`;

test("the page in view opens as the original names it", () => {
  assert.equal(at(""), home);
  assert.equal(at("/auth"), `${home}/auth/users`);
  assert.equal(at("/auth/oauth"), `${home}/auth/oauth-apps`);
  assert.equal(at("/auth/oauth-server"), `${home}/auth/oauth-server`);
  assert.equal(at("/auth/urls"), `${home}/auth/url-configuration`);
  assert.equal(at("/database"), `${home}/database/schemas`);
  assert.equal(at("/database/policies"), `${home}/database/policies`);
  assert.equal(at("/tables"), `${home}/editor`);
  assert.equal(at("/sql"), `${home}/sql/new`);
  assert.equal(at("/storage"), `${home}/storage/files`);
  assert.equal(at("/storage/s3"), `${home}/storage/s3`);
  assert.equal(at("/settings"), `${home}/settings/general`);
  assert.equal(at("/settings/jwt-keys"), `${home}/settings/jwt`);
  assert.equal(at("/settings/passwords"), `${home}/database/settings`);
});

test("a page keyed by what the original does not share stops at its list", () => {
  assert.equal(at("/database/tables/profiles"), `${home}/database/tables`);
  assert.equal(at("/auth/emails/confirmation"), `${home}/auth/templates`);
});

test("a bucket keeps its name", () => {
  assert.equal(at("/storage/b/avatars"), `${home}/storage/files/buckets/avatars`);
  assert.equal(at("/storage/b/my%20files/folder"), `${home}/storage/files/buckets/my%20files`);
});

test("anything unknown, or another project's path, opens the project home", () => {
  assert.equal(at("/somewhere-new"), home);
  assert.equal(at("/auth/oauthx"), home);
  assert.equal(at("/settings/"), `${home}/settings/general`);
  assert.equal(dashboardUrl(ref, "/p/zyxwvutsrqponmlkjihg/sql"), home);
  assert.equal(dashboardUrl(ref, "/"), home);
});
