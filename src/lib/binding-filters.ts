/**
 * A canned screen's binding filters travel to the server as JSON and are read
 * back by the serve-side parser, which accepts a filter `value` of only string
 * or number — a boolean makes it reject the WHOLE entry, so a home or fixed
 * screen stored with `{"field":"sharing","op":"eq","value":true}` silently
 * falls through to the live agent. The Spring query layer matches the STRINGS
 * "true"/"false" as booleans, so the string IS the correct wire form: coerce
 * every boolean here, before the write leaves the tool.
 */

/** A filter value as callers may send it (booleans included). */
export type BindingFilterValue = string | number | boolean;

/** ONE filter of a screen binding. */
export interface BindingFilterWire {
  field: string;
  op: string;
  value: BindingFilterValue;
}

/** ONE binding of a canned screen (home screen or a fixed screen). */
export interface ScreenBindingWire {
  path: string;
  entityName: string;
  filters?: BindingFilterWire[];
  sort?: { field: string; dir: "asc" | "desc" };
  limit?: number;
}

/** "true"/"false" for a boolean; every other value passes through untouched. */
function wireValue(value: BindingFilterValue): BindingFilterValue {
  return typeof value === "boolean" ? String(value) : value;
}

/**
 * A copy of the bindings with every boolean filter value written as the string
 * "true"/"false". Missing bindings, missing filters and non-array shapes are
 * tolerated: they come back as they arrived.
 */
export function normalizeBindingFilters(
  bindings: ScreenBindingWire[] | null | undefined
): ScreenBindingWire[] | undefined {
  if (!Array.isArray(bindings)) return undefined;
  return bindings.map((binding) => {
    if (!Array.isArray(binding?.filters)) return binding;
    return {
      ...binding,
      filters: binding.filters.map((filter) =>
        filter && typeof filter === "object" ? { ...filter, value: wireValue(filter.value) } : filter
      ),
    };
  });
}
