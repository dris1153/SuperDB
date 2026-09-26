import type { PolicyCommand } from "./policy-statements";

/**
 * The original's general templates (`Policies.constants.ts`), their wording kept. Choosing one fills
 * the editor; nothing runs until the statement is confirmed.
 */
export type PolicyTemplate = {
  id: string;
  title: string;
  description: string;
  name: string;
  command: PolicyCommand;
  roles: string[];
  using: string;
  check: string;
};

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    id: "policy-1",
    title: "Enable read access to everyone",
    description: "This policy gives read access to your table for all users via the SELECT operation.",
    name: "Enable read access for all users",
    command: "SELECT",
    roles: [],
    using: "true",
    check: "",
  },
  {
    id: "policy-2",
    title: "Enable insert access for authenticated users only",
    description: "This policy gives insert access to your table for all authenticated users only.",
    name: "Enable insert for authenticated users only",
    command: "INSERT",
    roles: ["authenticated"],
    using: "",
    check: "true",
  },
  {
    id: "policy-3",
    title: "Enable delete access for users based on their user ID *",
    description: 'This policy assumes that your table has a column "user_id", and allows users to delete rows which the "user_id" column matches their ID',
    name: "Enable delete for users based on user_id",
    command: "DELETE",
    roles: [],
    using: "(select auth.uid()) = user_id",
    check: "",
  },
  {
    id: "policy-4",
    title: "Enable insert access for users based on their user ID *",
    description: 'This policy assumes that your table has a column "user_id", and allows users to insert rows which the "user_id" column matches their ID',
    name: "Enable insert for users based on user_id",
    command: "INSERT",
    roles: [],
    using: "",
    check: "(select auth.uid()) = user_id",
  },
  {
    id: "policy-5",
    title: "Policy with table joins",
    description: "Query across tables to build more advanced RLS rules. Assuming 2 tables called `teams` and `members`, you can query both tables in the policy to control access to the members table.",
    name: "Policy with table joins",
    command: "UPDATE",
    roles: [],
    using: "(select auth.uid()) in (select user_id from members where team_id = id)",
    check: "",
  },
  {
    id: "policy-6",
    title: "Policy with security definer functions",
    description: "Useful in a many-to-many relationship where you want to restrict access to the linking table. Assumes a security definer function `get_teams_for_user`.",
    name: "Policy with security definer functions",
    command: "ALL",
    roles: [],
    using: "team_id in (select get_teams_for_user(auth.uid()))",
    check: "",
  },
  {
    id: "policy-7",
    title: "Policy to implement Time To Live (TTL)",
    description: "Implement a TTL-like feature where rows expire after a day: rows are available only if they were created within the last 24 hours.",
    name: "Policy to implement Time To Live (TTL)",
    command: "SELECT",
    roles: [],
    using: "created_at > (current_timestamp - interval '1 day')",
    check: "",
  },
  {
    id: "policy-8",
    title: "Allow users to only view their own data",
    description: "Restrict users to reading only their own data.",
    name: "Enable users to view their own data only",
    command: "SELECT",
    roles: ["authenticated"],
    using: "(select auth.uid()) = user_id",
    check: "",
  },
];
