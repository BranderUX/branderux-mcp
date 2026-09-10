import { isPlainObject } from "./policy-bag.js";

/**
 * Does this site take REQUESTS THAT CARRY A PRICE (orders, carts, quotes)?
 *
 * A visitor-writable entity holding a money field is the shape of a sale, and
 * a sale concluded in a chat is a distance contract: Israeli consumer law
 * (Consumer Protection Law s.14ג) hands that buyer disclosure and cancellation
 * rights that our platform does not implement yet. So the answer drives a
 * WARNING on publish, never a refusal: until the distance-selling pack exists,
 * the assistant may take the request and the business confirms it outside the
 * chat.
 */
const MONEY_WORDS = ["price", "total", "amount", "cost", "sum"];

/** Entity write policies that let a VISITOR create rows. */
const VISITOR_WRITE_POLICIES = new Set(["open", "end-user-owned"]);

/** JSON Schema types that hold a number (`["number", "null"]` counts too). */
function isNumericType(type: unknown): boolean {
  if (typeof type === "string") return type === "number" || type === "integer";
  if (Array.isArray(type)) return type.some(isNumericType);
  return false;
}

/**
 * Numeric properties of an entity schema whose NAME reads as money. The match
 * is a plain case-insensitive substring, so `totalPrice`, `amount_due` and
 * `unitCost` all count: over-warning about a price costs one sentence,
 * under-warning costs the buyer their rights.
 */
export function priceFields(jsonSchema: unknown): string[] {
  if (!isPlainObject(jsonSchema)) return [];
  const properties = jsonSchema.properties;
  if (!isPlainObject(properties)) return [];
  return Object.keys(properties).filter((name) => {
    const property = properties[name];
    if (!isPlainObject(property) || !isNumericType(property.type)) return false;
    const lowered = name.toLowerCase();
    return MONEY_WORDS.some((word) => lowered.includes(word));
  });
}

/**
 * The names of the project's entities that take priced requests from visitors
 * (empty = none), read from the entity definitions as `list_entities` returns
 * them.
 */
export function pricedRequestEntities(entities: unknown): string[] {
  if (!Array.isArray(entities)) return [];
  return entities
    .filter(
      (entity) =>
        isPlainObject(entity) &&
        typeof entity.writePolicy === "string" &&
        VISITOR_WRITE_POLICIES.has(entity.writePolicy) &&
        priceFields(entity.jsonSchema).length > 0
    )
    .map((entity) => String((entity as Record<string, unknown>).name ?? ""))
    .filter(Boolean);
}

/** The warning a publish carries when the site takes priced requests. */
export const ORDER_TAKING_NOTE =
  "This site takes requests with prices. Until the distance-selling pack exists, the assistant may only " +
  "take requests the business confirms outside the chat; it must not conclude a sale or take payment " +
  "(Consumer Protection Law s.14ג).";
