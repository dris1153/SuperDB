"use client";

import { useRef } from "react";
import type { RenderCheckboxProps } from "react-data-grid";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * The tick in the grid's selection column.
 *
 * react-data-grid's own renderer is a bare `<input type="checkbox">` — the browser's checkbox, not
 * this app's. `renderers.renderCheckbox` is the supported way to replace it, and it already hands
 * over `checked`, `indeterminate`, `disabled`, the roving `tabIndex` and the aria labels.
 *
 * The one thing it does not hand over is the shift key. rdg's default reads it off the native change
 * event to extend a selection from the last clicked row; Radix reports only the new value, so the
 * flag is taken from the click that caused it — a user `onClick` runs before Radix's own handler.
 */
function GridCheckbox({ onChange, indeterminate, checked, ...props }: RenderCheckboxProps) {
  const shift = useRef(false);

  return (
    <Checkbox
      {...props}
      checked={indeterminate === true ? "indeterminate" : checked}
      className="mx-auto"
      onClick={(e) => {
        shift.current = e.shiftKey;
      }}
      onCheckedChange={(next) => onChange(next === true, shift.current)}
    />
  );
}

/**
 * Declared once, at module scope: built inline it would be a different object on every render, and
 * the grid takes `renderers` as a prop.
 */
export const GRID_RENDERERS = {
  renderCheckbox: (props: RenderCheckboxProps) => <GridCheckbox {...props} />,
};
