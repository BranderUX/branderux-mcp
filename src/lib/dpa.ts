import { isPlainObject } from "./policy-bag.js";

/**
 * The data-processing engagement (DPA) an account owner accepts once.
 *
 * We process end-user data on the owner's behalf, so the engagement is what
 * makes that lawful. The owner accepts it in the browser, in one click; these
 * helpers only REPORT the state so an agent can ask for it at the right
 * moment. Nothing here ever blocks a build: a missing acceptance is a note the
 * agent relays, never a refusal (publishing in particular is never refused).
 */
export const DPA_VERSION = "2026-09-11";

/** Where the owner accepts it (the client's /legal/dpa/accept page). */
export const DPA_ACCEPT_URL = "https://branderux.com/legal/dpa/accept";

/**
 * Acceptance is asked of accounts created ON OR AFTER this instant. Older
 * accounts signed up under the previous terms, are never blocked, and see a
 * dismissible note in the app instead, so for every flag here they count as
 * accepted.
 */
const REQUIRED_FROM = Date.UTC(2026, 8, 11);

/**
 * Has this account accepted (or is it grandfathered)? `me` is the `/auth/me`
 * body: `dpaAccepted` is `{version, at}` once accepted and `null` until then,
 * and `createdAt` is the account's ISO creation time.
 *
 * A body carrying neither field (an older API) reads as NOT accepted: the
 * consequence is one extra sentence asking the owner to accept, never a
 * blocked build.
 */
export function hasAcceptedDpa(me: unknown): boolean {
  if (!isPlainObject(me)) return false;
  const accepted = me.dpaAccepted;
  // The wire shape is {version, at}; a flattened boolean (this server's own
  // whoami output, read back) counts too.
  if (accepted === true || isPlainObject(accepted)) return true;
  const createdAt = me.createdAt;
  if (typeof createdAt !== "string") return false;
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && created < REQUIRED_FROM;
}

/**
 * The sentence a successful publish carries for an account that has not
 * accepted yet. The site is live either way.
 */
export const DPA_PUBLISH_NOTE =
  "The data-processing engagement has not been accepted for this account yet: ask the owner to open " +
  `${DPA_ACCEPT_URL} and accept it (one click); the site is live meanwhile.`;
