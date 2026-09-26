import type { PolicyCommand } from "./policy-statements";

/**
 * The original's general templates (`Policies.constants.ts`), their wording kept. Choosing one fills
 * the editor; nothing runs until the statement is confirmed.
 */
export type PolicyTemplate = {
  id: string;
  description: string;
  name: string;
  command: PolicyCommand;
  roles: string[];
  using: string;
  check: string;
  /** The whole statement the original previews on hover, written for the table the editor is on. */
  statement: (schema: string, table: string) => string;
};

const on = (schema: string, table: string) => `"${schema}"."${table}"`;

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    id: "policy-1",
    statement: (s, t) => `create policy "Enable read access for all users"
on ${on(s, t)}
for select using (true);`,
    description: "This policy gives read access to your table for all users via the SELECT operation.",
    name: "Enable read access for all users",
    command: "SELECT",
    roles: [],
    using: "true",
    check: "",
  },
  {
    id: "policy-2",
    statement: (s, t) => `create policy "Enable insert for authenticated users only"
on ${on(s, t)}
for insert to authenticated
with check (true);`,
    description: "This policy gives insert access to your table for all authenticated users only.",
    name: "Enable insert for authenticated users only",
    command: "INSERT",
    roles: ["authenticated"],
    using: "",
    check: "true",
  },
  {
    id: "policy-3",
    statement: (s, t) => `create policy "Enable delete for users based on user_id"
on ${on(s, t)}
for delete using (
  (select auth.uid()) = user_id
);`,
    description: 'This policy assumes that your table has a column "user_id", and allows users to delete rows which the "user_id" column matches their ID',
    name: "Enable delete for users based on user_id",
    command: "DELETE",
    roles: [],
    using: "(select auth.uid()) = user_id",
    check: "",
  },
  {
    id: "policy-4",
    statement: (s, t) => `create policy "Enable insert for users based on user_id"
on ${on(s, t)}
for insert with check (
  (select auth.uid()) = user_id
);`,
    description: 'This policy assumes that your table has a column "user_id", and allows users to insert rows which the "user_id" column matches their ID',
    name: "Enable insert for users based on user_id",
    command: "INSERT",
    roles: [],
    using: "",
    check: "(select auth.uid()) = user_id",
  },
  {
    id: "policy-5",
    statement: () => `create policy "Members can update team details if they belong to the team"
on teams for update using (
  (select auth.uid()) in (
    select user_id from members where team_id = id
  )
);`,
    description: "Query across tables to build more advanced RLS rules. Assuming 2 tables called `teams` and `members`, you can query both tables in the policy to control access to the members table.",
    name: "Policy with table joins",
    command: "UPDATE",
    roles: [],
    using: "(select auth.uid()) in (select user_id from members where team_id = id)",
    check: "",
  },
  {
    id: "policy-6",
    statement: () => `create or replace function get_teams_for_user(user_id uuid)
returns setof bigint as $$
  select team_id from members where user_id = $1
$$ stable language sql security definer;

create policy "Team members can update team members if they belong to the team"
on members
for all using (
  team_id in (select get_teams_for_user(auth.uid()))
);`,
    description: "Useful in a many-to-many relationship where you want to restrict access to the linking table. Assumes a security definer function `get_teams_for_user`.",
    name: "Policy with security definer functions",
    command: "ALL",
    roles: [],
    using: "team_id in (select get_teams_for_user(auth.uid()))",
    check: "",
  },
  {
    id: "policy-7",
    statement: (s, t) => `create policy "Stories are live for a day"
on ${on(s, t)}
for select using (
  created_at > (current_timestamp - interval '1 day')
);`,
    description: "Implement a TTL-like feature where rows expire after a day: rows are available only if they were created within the last 24 hours.",
    name: "Policy to implement Time To Live (TTL)",
    command: "SELECT",
    roles: [],
    using: "created_at > (current_timestamp - interval '1 day')",
    check: "",
  },
  {
    id: "policy-8",
    statement: (s, t) => `create policy "Enable users to view their own data only"
on ${on(s, t)}
for select
to authenticated
using (
  (select auth.uid()) = user_id
);`,
    description: "Restrict users to reading only their own data.",
    name: "Enable users to view their own data only",
    command: "SELECT",
    roles: ["authenticated"],
    using: "(select auth.uid()) = user_id",
    check: "",
  },
];
