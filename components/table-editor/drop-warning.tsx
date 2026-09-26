/**
 * What dropping this column costs.
 *
 * Only a *known* zero stays quiet. The count is null while it is in flight and also whenever it
 * failed — a statement timeout on a large table looks exactly like an empty column, so silence there
 * would hide the one thing this warning exists for.
 */
export function DropWarning({ usage }: { usage: { total: number; filled: number } | null }) {
  if (usage == null) {
    return <p>Could not read how many rows hold a value here. Assume this column has data in it.</p>;
  }
  if (usage.filled === 0) return null;
  return (
    <p>
      {usage.filled} of {usage.total} rows hold a value in this column. Dropping it discards every
      one of them.
    </p>
  );
}
