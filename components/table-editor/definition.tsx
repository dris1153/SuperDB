import { Copyable, CodeBlock } from "@/components/connect-primitives";
import { Empty } from "@/components/ui/empty-state";

/**
 * The synthesised `CREATE TABLE`, highlighted on the server like every other snippet in this app.
 *
 * `CodeBlock` already handles the case where Shiki returned null — the plain text is more useful than
 * an empty block, so highlighting failure degrades rather than breaks.
 */
export function Definition({
  ddl,
  html,
  complete,
}: {
  ddl: string | null;
  html: string | null;
  /** False when this shape cannot be fully reconstructed from the catalog. */
  complete: boolean;
}) {
  if (!ddl) {
    return (
      <div className="p-6">
        <Empty>No definition could be reconstructed for this relation.</Empty>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
      {!complete ? (
        // Saying so beats letting someone copy SQL that silently drops the partitioning clause.
        <p className="rounded-md border border-warn/40 px-3 py-2 text-xs text-warn">
          Partial definition — partitioning is not reconstructed here. Copying this will not recreate
          the table exactly.
        </p>
      ) : null}

      <p className="text-xs text-subtle">
        Rebuilt from the catalog, not stored SQL. Sequence-backed defaults such as{" "}
        <code className="font-mono">nextval(...)</code> reference a sequence that has to exist first.
      </p>

      <div className="relative">
        <Copyable value={ddl} className="absolute top-2 right-2 z-10" />
        <CodeBlock html={html} code={ddl} />
      </div>
    </div>
  );
}
