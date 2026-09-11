# Code Reviewer Memory

- [Schema deploy sequencing](project_schema_deploy_sequencing.md) — schema.sql is applied by hand; always check migration-before-code ordering and re-run idempotency
- [Project refs are not unique](project_project_ref_not_unique.md) — the same ref can appear twice in loadInventory; check every ref-keyed map, key and upsert
