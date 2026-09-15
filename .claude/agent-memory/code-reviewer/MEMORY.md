# Code Reviewer Memory

- [Schema deploy sequencing](project_schema_deploy_sequencing.md) — schema.sql is applied by hand; always check migration-before-code ordering and re-run idempotency
- [Project refs are not unique](project_project_ref_not_unique.md) — the same ref can appear twice in loadInventory; check every ref-keyed map, key and upsert
- [Action error text is redacted in prod](project_action_error_text_redacted.md) — thrown server-action messages never reach the browser; setError(e.message) shows React's digest string
- [Tests cover lib/ only](project_tests_cover_lib_only.md) — "pnpm test (N) green" proves nothing about components/; no DOM harness exists, so client state machines ship unverified
- [Mgmt API types are subsets](project_mgmt_api_types_are_subsets.md) — call() returns the whole upstream body; api-keys ships the real key at reveal=false. Never trust the declared type at a client boundary
- [CSR fan-out multiplies resolveProject](project_csr_fanout_amplifies_resolveproject.md) — mostly fixed by the owners memo + in-flight refresh map; both are in-process only
- [25006 proves little](project_readonly_refusal_proves_little.md) — read-only refusals are by command tag; DDL "verified" by a 25006 probe is unverified
- [ok:true with no data](project_part_ok_true_without_data.md) — an empty upstream body ships `{"ok":true}`; `state.data` is typed T but can be undefined, and the deref kills the whole route
- [Disabled parts now read as idle](project_partstate_collapses_disabled_into_pending.md) — fixed; the live trap is branches on `status === "pending"` alone that drop `idle` into the else
- [null means error, not loading](project_null_reads_as_error_not_loading.md) — recurring; definition.tsx and sql-editor/results.tsx still print an answer while a query is in flight
- [Module state splits per Next layer](project_module_state_splits_per_next_layer.md) — a lib/ Map is compiled once per layer; route handlers and server actions never share it
- [identity has no part cache](project_identity_has_no_part_cache.md) — dropProject cannot invalidate a project name; only the owners memo holds it, and nothing exports a way to clear it
- [rotateVault covers one table](project_rotatevault_covers_one_table.md) — a master-password change orphans every vault blob outside connection_secrets; seal() returning undefined is the same boundary
