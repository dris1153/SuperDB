import {
  IconBraces,
  IconCalendar,
  IconDiamond,
  IconDiamondFilled,
  IconFingerprint,
  IconHash,
  IconKey,
  IconLink,
  IconListDetails,
  IconToggleRight,
  IconLetterT,
} from "@tabler/icons-react";
import { typeAffordance, type TableColumn, type TypeAffordance } from "@/lib/table-entities";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<TypeAffordance, typeof IconHash> = {
  number: IconHash,
  time: IconCalendar,
  text: IconLetterT,
  json: IconBraces,
  bool: IconToggleRight,
  other: IconListDetails,
};

export function TypeIcon({ type }: { type: string }) {
  const Icon = TYPE_ICONS[typeAffordance(type)];
  return <Icon size={15} stroke={1.5} className="text-subtle" aria-hidden />;
}

const SEGMENT = "inline-flex h-[21px] items-center border px-[5.5px] font-mono text-[11px] font-medium tracking-[0.06em] uppercase";

/** The original's constraint token: an icon cell and a label cell joined, mono and letter-spaced. */
function Token({ icon, label, primary }: { icon: React.ReactNode; label: string; primary?: boolean }) {
  const tone = primary ? "border-primary/60 bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground";
  return (
    <span className="inline-flex items-center whitespace-nowrap">
      <span className={cn(SEGMENT, tone, "rounded-l-md border-r-0")}>{icon}</span>
      <span className={cn(SEGMENT, tone, "rounded-r-md")}>{label}</span>
    </span>
  );
}

/** In the original's order: primary, foreign key, unique, identity, then nullability. */
export function ConstraintTokens({ column: c }: { column: TableColumn }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {c.primary ? <Token primary icon={<IconKey size={12} stroke={1.7} />} label="Primary" /> : null}
      {c.foreign ? <Token icon={<IconLink size={12} stroke={1.7} />} label="Foreign key" /> : null}
      {c.unique ? <Token icon={<IconFingerprint size={12} stroke={1.7} />} label="Unique" /> : null}
      {c.identity ? <Token icon={<IconHash size={12} stroke={1.7} />} label="Identity" /> : null}
      {c.nullable ? (
        <Token icon={<IconDiamond size={12} stroke={1.7} />} label="Nullable" />
      ) : (
        <Token icon={<IconDiamondFilled size={12} />} label="Non-nullable" />
      )}
    </div>
  );
}
