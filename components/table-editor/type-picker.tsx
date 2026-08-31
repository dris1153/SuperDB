"use client";

import { COMMON_TYPES } from "@/lib/ddl-build";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The type list, common ones first and the rest of the catalog behind them.
 *
 * The whole list comes from the project's own `pg_type`, so a name that is not in it is one the
 * builder will refuse — a picker rather than a text field is what makes that impossible to hit.
 */
export function TypePicker({
  value,
  types,
  onChange,
}: {
  value: string;
  types: string[];
  onChange: (next: string) => void;
}) {
  const common = COMMON_TYPES.filter((t) => types.includes(t));
  const rest = types.filter((t) => !COMMON_TYPES.includes(t));

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label="Column type">
        <SelectValue placeholder="type" />
      </SelectTrigger>
      <SelectContent>
        {common.length > 0 ? (
          <SelectGroup>
            <SelectLabel>Common</SelectLabel>
            {common.map((t) => (
              <SelectItem key={t} value={t} className="font-mono text-xs">
                {t}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
        {common.length > 0 && rest.length > 0 ? <SelectSeparator /> : null}
        {rest.map((t) => (
          <SelectItem key={t} value={t} className="font-mono text-xs">
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
