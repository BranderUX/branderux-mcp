// A canned screen's boolean filter value must leave the tool as the string
// "true"/"false": the serve-side parser rejects a boolean and drops the whole
// binding, so the designed screen would silently fall through to the live agent.
import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeBindingFilters } from "../dist/lib/binding-filters.js";

const binding = (filters) => ({ path: "grid.items", entityName: "products", filters });

test("a boolean filter value becomes the string \"true\"/\"false\"", () => {
  const out = normalizeBindingFilters([
    binding([
      { field: "sharing", op: "eq", value: true },
      { field: "archived", op: "eq", value: false },
    ]),
  ]);
  assert.deepEqual(out[0].filters, [
    { field: "sharing", op: "eq", value: "true" },
    { field: "archived", op: "eq", value: "false" },
  ]);
});

test("numbers and strings are left untouched", () => {
  const filters = [
    { field: "price", op: "lt", value: 120 },
    { field: "category", op: "eq", value: "chairs" },
  ];
  const out = normalizeBindingFilters([binding(filters)]);
  assert.deepEqual(out[0].filters, filters);
  assert.equal(typeof out[0].filters[0].value, "number");
});

test("the rest of the binding rides through unchanged", () => {
  const input = {
    path: "grid.items",
    entityName: "products",
    filters: [{ field: "onSale", op: "eq", value: true }],
    sort: { field: "price", dir: "asc" },
    limit: 12,
  };
  const [out] = normalizeBindingFilters([input]);
  assert.deepEqual(out.sort, { field: "price", dir: "asc" });
  assert.equal(out.limit, 12);
  assert.equal(out.path, "grid.items");
  assert.equal(input.filters[0].value, true, "the caller's array is not mutated");
});

test("missing filters and missing bindings are tolerated", () => {
  assert.deepEqual(normalizeBindingFilters([{ path: "grid.items", entityName: "products" }]), [
    { path: "grid.items", entityName: "products" },
  ]);
  assert.deepEqual(normalizeBindingFilters([]), []);
  assert.equal(normalizeBindingFilters(undefined), undefined);
  assert.equal(normalizeBindingFilters(null), undefined);
  assert.equal(normalizeBindingFilters("junk"), undefined);
});

test("a value that is neither string, number nor boolean passes through", () => {
  const out = normalizeBindingFilters([binding([{ field: "tags", op: "in", value: ["a", "b"] }])]);
  assert.deepEqual(out[0].filters[0].value, ["a", "b"]);
});
