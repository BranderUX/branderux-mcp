import { contactFields } from "./contact-fields.js";
import { isPlainObject } from "./policy-bag.js";

/**
 * Pure helpers of the owner-data tools: which entities a query covers, which
 * of their fields hold contact details (for the consent notice), and how a
 * query of a LIVE catalog (rows fetched from the business's own store) is
 * translated into the web app's catalog query.
 */

type Json = Record<string, unknown>;

export type QueryScope = "collected" | "catalog" | "all";

/** A live catalog: its rows come from the business's store, not from BranderUX. */
export function isLiveEntity(entity: Json): boolean {
  return isPlainObject(entity.source);
}

/**
 * A collected entity (what visitors submit: leads, bookings, orders, requests).
 * The server says so with `effectiveKind` (null for a catalog); a server that
 * does not send it yet is read by the same rule it applies: a visitor-writable
 * entity that is not live.
 */
export function isCollectedEntity(entity: Json): boolean {
  if ("effectiveKind" in entity) return typeof entity.effectiveKind === "string";
  return (
    !isLiveEntity(entity) &&
    (entity.writePolicy === "open" || entity.writePolicy === "end-user-owned")
  );
}

/** The stored (non-live) entities a query of this scope reads. */
export function entitiesInScope(entities: Json[], scope: QueryScope): Json[] {
  return entities.filter((entity) => {
    if (isLiveEntity(entity)) return false;
    if (scope === "all") return true;
    return scope === "collected" ? isCollectedEntity(entity) : !isCollectedEntity(entity);
  });
}

/** The contact-bearing fields of these entities, each named once, in order. */
export function unionContactFields(entities: Json[]): string[] {
  const fields: string[] = [];
  for (const entity of entities) {
    for (const field of contactFields(entity.jsonSchema)) {
      if (!fields.includes(field)) fields.push(field);
    }
  }
  return fields;
}

/** The contact-bearing fields among a list of schema property keys. */
export function contactFieldsOfKeys(keys: string[]): string[] {
  return contactFields({ type: "object", properties: Object.fromEntries(keys.map((key) => [key, {}])) });
}

/** The notice `list_visitors` always carries: signed-in visitors' emails and names. */
export const VISITORS_NOTICE =
  "These are signed-in visitors' emails and names. Use them only to answer each person's own request; " +
  "they may NOT be marketed to: no offers, newsletters or campaigns.";

/** The web app's catalog query (live catalogs run the serve fetcher there). */
export const CATALOG_QUERY_PATH = "/api/agent/catalog/query";

/** The ops a live catalog can filter on (the store's rows are filtered in memory). */
const LIVE_OPS = new Set(["eq", "neq", "lt", "lte", "gt", "gte", "contains"]);

const LIVE_MAX_CONDITIONS = 4;
const LIVE_MAX_LIMIT = 50;

/** The page size a live read asks for when the caller named none (the owner query's default). */
export const LIVE_DEFAULT_LIMIT = 25;

/** The one rule a live catalog read follows, named for the entity. */
export function liveCatalogRule(entity: string): string {
  return (
    `${entity} is a live catalog, read from the business's store: use at most ${LIVE_MAX_CONDITIONS} where ` +
    "conditions with eq, neq, lt, lte, gt, gte or contains and a single value each, at most one sort key " +
    `and a limit of at most ${LIVE_MAX_LIMIT}, without text or a cursor.`
  );
}

export type WhereCondition = { field: string; op: string; value?: unknown };

export type LiveQueryInput = {
  where?: WhereCondition[];
  sort?: { field: string; dir: "asc" | "desc" }[];
  text?: string;
  cursor?: string;
  limit?: number;
};

export type LiveCatalogBody = {
  projectId: string;
  entity: string;
  filters: { field: string; op: string; value: string }[];
  sort?: { field: string; dir: "asc" | "desc" };
  limit: number;
};

/**
 * The catalog query body for a live entity, or the rule it broke. Nothing is
 * dropped silently: a condition the store query cannot apply refuses the
 * whole read, because a quietly wider list would be presented as filtered.
 * Every value travels as a string (40 as "40", true as "true"): the store
 * filter takes string values, as serving sends them, and reads a number out
 * of one for the range ops. A raw number would pass every row through `neq`
 * and break `contains`.
 */
export function liveCatalogBody(
  projectId: string,
  entity: string,
  input: LiveQueryInput
): { body: LiveCatalogBody } | { error: string } {
  const where = input.where ?? [];
  const sort = input.sort ?? [];
  const limit = input.limit ?? LIVE_DEFAULT_LIMIT;
  const broken =
    where.length > LIVE_MAX_CONDITIONS ||
    sort.length > 1 ||
    limit > LIVE_MAX_LIMIT ||
    input.text !== undefined ||
    input.cursor !== undefined ||
    where.some(
      (condition) =>
        !LIVE_OPS.has(condition.op) ||
        !(
          typeof condition.value === "string" ||
          typeof condition.value === "number" ||
          typeof condition.value === "boolean"
        )
    );
  if (broken) return { error: liveCatalogRule(entity) };
  return {
    body: {
      projectId,
      entity,
      filters: where.map((condition) => ({
        field: condition.field,
        op: condition.op,
        value: String(condition.value),
      })),
      ...(sort.length === 1 ? { sort: sort[0] } : {}),
      limit,
    },
  };
}

/** Only the named fields of a row (every field when none are named). */
export function projectFields(row: Json, fields: string[] | undefined): Json {
  if (!fields || fields.length === 0) return row;
  return Object.fromEntries(fields.filter((field) => field in row).map((field) => [field, row[field]]));
}

/** A zone the runtime accepts, else UTC (the server's own fallback). */
export function validTimezone(zone: unknown): string {
  if (typeof zone !== "string" || !zone.trim()) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone.trim() });
    return zone.trim();
  } catch {
    return "UTC";
  }
}
