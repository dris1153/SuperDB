/**
 * What is executing against this project right now.
 *
 * Read-only, and there is deliberately **no way to kill a session**. `pg_terminate_backend` would be
 * a foot-gun on a dashboard this size with no confirmation model built for it — Supabase's own UI
 * offers it, and this is a considered omission rather than something left to do.
 *
 * `left(query, 200)` because a long statement makes the table unreadable and the full text is rarely
 * what is wanted at a glance. `pid <> pg_backend_pid()` so the list does not include the query asking
 * the question. Idle sessions are excluded: `query` holds the *last* statement a session ran, so an
 * idle connection's `delete from users` would sit under a heading saying it is running. Active first
 * and newest first, because a pooler's hundred old idle-in-transaction sessions would otherwise fill
 * the limit and hide what is actually executing. What the read-only role may see of *other* users' sessions is limited — `query` and
 * `usename` can come back null — so the view has to render that rather than assume full visibility.
 *
 * Data only, with no imports: `scripts/probe-sql-templates.mjs` imports this statement to run it, and
 * plain Node cannot resolve this repo's extensionless imports.
 */

export type RunningQuery = {
  pid: number;
  usename: string | null;
  state: string | null;
  wait_event_type: string | null;
  query_start: string | null;
  query: string | null;
};

export const RUNNING_QUERIES_SQL = `
select pid,
       usename,
       state,
       wait_event_type,
       query_start,
       left(query, 200) as query
  from pg_catalog.pg_stat_activity
 where datname = current_database()
   and pid <> pg_backend_pid()
   and backend_type = 'client backend'
   and state is distinct from 'idle'
 order by (state = 'active') desc, query_start desc nulls last
 limit 100;`;
