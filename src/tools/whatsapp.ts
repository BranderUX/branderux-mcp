import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ApiError, type ApiClient } from "../api-client.js";
import { AppError, AppNotJsonError, isRedirect, type AppClient } from "../app-client.js";
import { IDEMPOTENT_WRITE, READ_ONLY, WRITE, fail, guarded, ok } from "./helpers.js";
import { POLICY_BAG_MAX_BYTES, isPlainObject, mergePolicyBag, policyBagBytes } from "../lib/policy-bag.js";

const projectIdSchema = z.string().uuid();

/** WhatsApp cuts a list row's title at 24 characters (Meta's limit). */
export const WHATSAPP_TITLE_MAX = 24;
/** The most titles one set_whatsapp_titles call may carry, and the most the policy bag keeps. */
export const WHATSAPP_TITLES_MAX = 50;
/** A title is keyed by a chip's query, which equals a fixed screen's matchQuery: the same 200-character cap. */
export const WHATSAPP_TITLE_QUERY_MAX = 200;

/**
 * The `error` of the 503 every Spring WhatsApp endpoint answers while the
 * channel is switched off on that server (WhatsAppProperties.ERROR_NOT_CONFIGURED):
 * `{timestamp, status: 503, error, code, message, retryable: false}`. The API
 * client words an ApiError from a body's `error_description`, else its `error`,
 * else its `message`; that body carries no `error_description` (the server's
 * WhatsAppChannelOffTest pins it key for key), so the code is in the wording,
 * which is how a switched-off channel is told apart from an outage's 503.
 */
export const WHATSAPP_NOT_CONFIGURED = "whatsapp_not_configured";

/**
 * The `error` of Spring's 409 when a forms run cannot start because the number
 * does not answer (WhatsAppChannelException.Reason.NEEDS_RECONNECT): it is
 * already waiting for the owner (needs_reconnect), or the run found a stored
 * token the server cannot use and marked it so. Same body shape as the 503
 * above, so the code is in the ApiError's wording the same way.
 */
export const WHATSAPP_NEEDS_RECONNECT = "whatsapp_needs_reconnect";

/**
 * The web app's own WhatsApp switch, a PUBLIC read (no credential rides it):
 * `{available: true}` only where the app has WhatsApp for owners at all, both
 * Embedded Signup ids built in AND its channel on (the client's
 * builderWhatsAppOn(), the gate the in-app Builder hands these tools behind).
 * The owner connects a number and looks after it only in the app (the Agent
 * tab's WhatsApp row, the in-app Builder's connect card), so Spring's channel
 * on its own is no WhatsApp to offer: while the app's switch is off (a partial
 * rollout, or an app that lost its queue) or the app has no such route yet
 * (noSwitchRoute), get_whatsapp_status answers `available: false`, the way
 * the in-app Builder stays silent.
 */
export const WHATSAPP_AVAILABILITY_PATH = "/api/whatsapp/availability";

/**
 * Said by every WhatsApp tool. Connecting is the OWNER's own click in Meta's
 * sign-in window (Embedded Signup), so no number, code or token ever passes
 * through a conversation TO CONNECT it. That rule is about connecting alone,
 * as in the in-app Builder's WHATSAPP rule: it never changes the handoff, so a
 * WhatsApp number or link for handing a customer to a person
 * (policies.handoff.whatsapp) is still asked for, confirmed and stored,
 * whatever the channel's status (available: false included).
 */
const OWNER_CONNECTS =
  "The owner connects WhatsApp themselves: the WhatsApp row of the Agent tab, or the in-app Builder's connect card, " +
  "opens Meta's own sign-in window. To connect it, never ask for a phone number, a code or a token; a WhatsApp handoff " +
  "number or link is still asked, confirmed and stored in policies.handoff.whatsapp, whatever the status.";

/**
 * What a connect needs (the server's blockedReason says which is missing).
 * get_whatsapp_status says it through blockedReason's own values instead,
 * which keeps its description inside the 2,048-character window.
 */
const CONNECT_NEEDS = "WhatsApp needs a published agent (publish_site) and a site that does not require sign-in.";

/**
 * Either half closed: the server's channel, or the web app's WhatsApp for
 * owners. Worded for a connected number too, which the app can have lost.
 */
const NOT_OPEN =
  "WhatsApp is not open on BranderUX yet, so there is no WhatsApp here to offer or look after. " +
  "Say nothing about WhatsApp to the owner.";

/** A forms run refused because the number waits for the owner: the reply step 8 reads as "not answering". */
const NOT_ANSWERING =
  "No form was republished: this WhatsApp number is waiting for the owner (reconnectRequired: true), so WhatsApp is " +
  "not answering. Say that instead of saying the number answers, and that the WhatsApp row of the Agent tab shows " +
  "what it needs; never promise that connecting again fixes it.";

/**
 * A 404 on the status read names no cause: a server that predates the channel
 * (an MCP deploy ahead of the API's) and a project the server does not know
 * both answer it. Either way there is nothing to offer. Checked on a live
 * server (2026-09-25): with a valid bearer, a path Spring does not map is its
 * plain 404 error body, not a 401, because the request's security context is
 * saved (a JSESSIONID comes back) and so reaches the error dispatch. A
 * session-less API would answer 401 there instead: then deploy the API first.
 */
const NO_STATUS =
  "No WhatsApp status came back for this project (404: a server without the WhatsApp channel, or a project it does not know). " +
  "Say nothing about WhatsApp to the owner.";

const NO_AGENT =
  "This project has no hosted agent yet. WhatsApp answers only for a published hosted agent: configure it " +
  "(upsert_agent_config) and publish it (publish_site) first.";

const NO_TITLES = "Send at least one title, or replace: true with an empty list to clear every stored title.";

const whatsappPath = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/whatsapp`;
const agentConfigPath = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/agent-config`;

/** The stored `policies.whatsappTitles`, string entries only (anything else never shows on WhatsApp). */
function storedTitles(policies: unknown): Record<string, string> {
  const titles = isPlainObject(policies) ? policies.whatsappTitles : undefined;
  if (!isPlainObject(titles)) return {};
  return Object.fromEntries(
    Object.entries(titles).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

/**
 * Whether the stored `policies.whatsappTitles` already is `next`: the same
 * queries, each with the same title, compared as maps. Key order never counts:
 * the server keeps the policy bag in a jsonb column, which hands an object's
 * keys back shortest first rather than in the order they were written, and a
 * title is only ever looked up by its query. No map, null and an empty map all
 * mean no titles; anything else stored under the key differs from every set.
 */
function sameTitles(stored: unknown, next: ReadonlyMap<string, string>): boolean {
  if (stored === undefined || stored === null) return next.size === 0;
  if (!isPlainObject(stored)) return false;
  const entries = Object.entries(stored);
  return (
    entries.length === next.size && entries.every(([query, title]) => next.has(query) && next.get(query) === title)
  );
}

/** A server reply as an object, whatever shape it came back in (204 = nothing to report). */
function asRecord(value: unknown): Record<string, unknown> {
  if (isPlainObject(value)) return value;
  return value === null || value === undefined ? {} : { result: value };
}

/** Only the server's own code means the channel is switched off; any other 503 is an outage and stays an error. */
const channelOff = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 503 && error.message.includes(WHATSAPP_NOT_CONFIGURED);

/** Only the server's own 409 code means the number waits for the owner; any other 409 stays an error. */
const waitsForOwner = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 409 && error.message.includes(WHATSAPP_NEEDS_RECONNECT);

/** The status while WhatsApp is not open here, and why (the diagnostic `reason`). */
const notOpen = (reason: string) => ok(NOT_OPEN, { available: false, whatsapp: null, reason });

/**
 * Whether a failed read of the switch means the web app has no such route, so
 * no WhatsApp for owners. An app from before WhatsApp sends a request with no
 * session cookie for a path it does not know to its sign-in page: a redirect,
 * which getPublic never follows. An app that lets the path through without
 * the route answers 404. A 2xx page that is not JSON is served in the route's
 * place. None of them is the route answering.
 */
const noSwitchRoute = (error: unknown): error is AppError =>
  error instanceof AppNotJsonError ||
  (error instanceof AppError && (error.status === 404 || isRedirect(error.status)));

/**
 * Why the web app has no WhatsApp for owners, or null when it has one. Only
 * an explicit `available: true` opens it, and an app without the route
 * (noSwitchRoute) has none. Any other failure (an outage, a rate limit, a
 * timeout) throws: like Spring's own outages, it is never read as a closed
 * channel.
 */
async function appWhatsAppOff(app: AppClient): Promise<string | null> {
  let answer: unknown;
  try {
    answer = await app.getPublic<unknown>(WHATSAPP_AVAILABILITY_PATH);
  } catch (error) {
    if (noSwitchRoute(error)) return error.message;
    throw error;
  }
  if (isPlainObject(answer) && answer.available === true) return null;
  return `GET ${WHATSAPP_AVAILABILITY_PATH} → ${JSON.stringify(answer ?? null).slice(0, 300)}`;
}

const tooManyTitles = (count: number) =>
  `That would keep ${count} WhatsApp titles; the most is ${WHATSAPP_TITLES_MAX}, and only the home's current chips need one. ` +
  "Send those with replace: true (every other stored title goes), or remove the titles of chips that are gone (title: null). " +
  "Nothing was stored.";

const bagTooBig = (bytes: number, restBytes: number) =>
  `With these titles the hosted agent's policies would take ${bytes} bytes (the other policies take ${restBytes}), ` +
  `past the ${POLICY_BAG_MAX_BYTES}-byte limit the server enforces, so nothing was stored. ` +
  "Send only the home's current chips with replace: true, or remove the titles of chips that are gone (title: null).";

/**
 * The WhatsApp channel of a HOSTED agent: the same agent answering on the
 * business's own WhatsApp number (read brander://docs/whatsapp-channel). The
 * connect itself is never a tool: it is the owner's click in Meta's window.
 *
 * Registered behind the same switch as publish_site/get_site (agent.ts): a
 * project connects only once it is published, so these tools ride with the
 * tool that publishes. Whether WhatsApp is open at all is read at run time:
 * get_whatsapp_status answers `available: false` where the channel is off on
 * the server, or where the web app has no WhatsApp for owners
 * (WHATSAPP_AVAILABILITY_PATH, read through `app`).
 */
export function registerWhatsAppTools(server: McpServer, api: ApiClient, app: AppClient): void {
  if (process.env.AGENTIC_APPS_ENABLED !== "1") {
    return;
  }

  server.registerTool(
    "get_whatsapp_status",
    {
      title: "WhatsApp channel status",
      description:
        "Read whether this project's hosted agent can answer on WhatsApp. " +
        "available: false means there is no WhatsApp here to offer: " +
        "say nothing about it to the owner. " +
        "Otherwise whatsapp is the server's report: connected (true from the owner's connect until the number is " +
        "disconnected; status, blockedReason and sendBlockedReason say whether it answers), " +
        "status (null before any connect; connecting: a connect under way, not answering yet; active: it answers; " +
        "needs_reconnect: a breakage, it does not answer and the Agent tab's WhatsApp row shows what it needs; " +
        "disconnected: the owner ended it on purpose, so say nothing about WhatsApp unless they ask and never offer it again), " +
        "displayPhone and displayName, quality (Meta's rating), " +
        "tier and messagingLimit (the same value: Meta's messaging limit), " +
        "pauseHours (how long the agent stays quiet in a chat after the owner replies: 1, 4 or 24 hours, or 16, " +
        "\"until tomorrow morning\": until the first 08:00 in the business's time zone that is at least four hours after the reply), " +
        "flows (entities with a live form), coexistence (see the doc), connectedAt and smbSyncRequestedAt (for the record), " +
        "blockedReason (not_published: publish the site first; login_required_site: WhatsApp is not available yet for a site " +
        "that requires sign-in; null: nothing blocks it): it stops a connect, and on a connected number it stops the answers " +
        "until it is lifted, and sendBlockedReason with sendBlockedAt (Meta refusing to send: see the doc). " +
        // The 2,048-character window leaves the send block a pointer: the
        // channel doc words each reason and what to tell the owner.
        OWNER_CONNECTS +
        " Call it last in a hosted build, after the wrap-up, to decide what to say about WhatsApp, if anything; " +
        "say each not-answering sentence and the offer at most once per conversation. " +
        // The status comes first and the doc only after it: while the channel is
        // off (available: false) nothing is said, so nothing is read.
        "Read brander://docs/whatsapp-channel only to offer or maintain it.",
      inputSchema: { projectId: projectIdSchema.describe("Project id") },
      outputSchema: {
        available: z.boolean(),
        whatsapp: z.object({}).passthrough().nullable(),
        reason: z.string().optional(),
      },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId }) => {
      let status: unknown;
      try {
        status = await api.get<unknown>(whatsappPath(projectId));
      } catch (error) {
        if (channelOff(error)) return notOpen(error.message);
        if (error instanceof ApiError && error.status === 404) {
          return ok(NO_STATUS, { available: false, whatsapp: null, reason: error.message });
        }
        throw error;
      }
      // Spring's channel alone is no WhatsApp to offer: the owner connects and
      // looks after a number in the web app, so the app's own switch decides
      // too. Asked second, so a server with the channel off answers alone.
      const appOff = await appWhatsAppOff(app);
      if (appOff !== null) return notOpen(appOff);
      return ok({ available: true, whatsapp: isPlainObject(status) ? status : null });
    })
  );

  server.registerTool(
    "publish_whatsapp_forms",
    {
      title: "Republish the WhatsApp forms",
      description:
        "Republish this project's WhatsApp forms from its CURRENT entities: every entity visitors can add to (writePolicy open, its " +
        "create_<entity> tool not switched off) becomes one " +
        "native WhatsApp form (a date picker for a date, a choice list for an enum, a consent tick for marketingConsent, " +
        "a yes/no choice for any other true/false field, text fields for the rest), " +
        "each field labelled with the property's title in the site's language, and the older versions are retired, " +
        "so a form a customer received before the republish no longer opens. " +
        "Connecting WhatsApp publishes the forms by itself, so call this only on a project whose WhatsApp is CONNECTED (get_whatsapp_status): " +
        "after you change a writable entity (define_entity), or when such an entity is missing from its flows, so every form matches its entity again. " +
        "The reply names the entities published, unchanged, removed and failed ({entity, reason}: a failed one keeps its older form, if it " +
        "had one), then reconnectRequired and channel, the status after the run: reconnectRequired true or a channel.status other than " +
        "active means WhatsApp is not answering, so say that instead of saying the number answers. " +
        "A number already waiting for the owner runs nothing and answers reconnectRequired true alone. " +
        "WhatsApp shows about 20 characters of a field's label (40 for a date): keep every intake title a short phrase. " +
        OWNER_CONNECTS +
        " " +
        CONNECT_NEEDS,
      inputSchema: { projectId: projectIdSchema.describe("Project id") },
      outputSchema: { forms: z.object({}).passthrough() },
      annotations: WRITE,
    },
    guarded(async ({ projectId }) => {
      try {
        const published = await api.post<unknown>(`${whatsappPath(projectId)}/flows/publish`, {});
        return ok({ forms: asRecord(published) });
      } catch (error) {
        // Any other 503, 404 or 409 (an outage, a project the server does not
        // know) surfaces as the error it is: a needed republish is never read
        // as a closed channel. The server's own 409 whatsapp_needs_reconnect
        // is a fact about the number, not a failed call: it answers the way a
        // run that found the token refused does, so step 8's rule applies.
        if (channelOff(error)) return fail(NOT_OPEN);
        if (waitsForOwner(error)) {
          return ok(NOT_ANSWERING, { forms: { reconnectRequired: true, reason: error.message } });
        }
        throw error;
      }
    })
  );

  server.registerTool(
    "set_whatsapp_titles",
    {
      title: "Short WhatsApp titles for the home's chips",
      description:
        "On WhatsApp the home's chips become the rows of one list, and a row title stops at 24 characters. Give every chip whose label " +
        "runs longer a short title, at most 24 characters and in the site's language, keyed by the chip's query exactly as it is stored " +
        "(character for character, the same words as its fixed screen's matchQuery). Tapping the row still sends the chip's full query, " +
        "and the chips on the site keep their labels. " +
        "The titles MERGE into policies.whatsappTitles ({query: title}) of the hosted-agent config: send only the ones that change, " +
        "at most 50 per call, and a title of null removes that query's title; every other stored title and the rest of the policy bag " +
        "stay exactly as they are. After the home's chips change, send the whole current set with replace: true instead, so the titles " +
        "of chips that are gone go too (an empty list clears them all); a call that changes nothing writes nothing. " +
        "At most 50 titles are kept, and the policy bag must stay within the server's 8 KB: a call past " +
        "either limit is refused and stores nothing. Write them here, never through upsert_agent_config, whose policies write would " +
        "replace the whole map. " +
        OWNER_CONNECTS +
        " " +
        CONNECT_NEEDS,
      inputSchema: {
        projectId: projectIdSchema.describe("Project id"),
        titles: z
          .array(
            z.object({
              query: z
                .string()
                .min(1)
                .max(WHATSAPP_TITLE_QUERY_MAX)
                .describe("The chip's query exactly as stored on the home (the same words as its fixed screen's matchQuery)"),
              title: z
                .string()
                .trim()
                .min(1)
                .max(WHATSAPP_TITLE_MAX)
                .regex(/^[^\r\n]+$/, "one line")
                .nullable()
                .describe(
                  "The WhatsApp list title: one line, at most 24 characters, in the site's language; null removes that query's stored title"
                ),
            })
          )
          .max(WHATSAPP_TITLES_MAX)
          .describe("At most 50 per call; each one MERGES by query into the stored titles, unless replace is true"),
        replace: z
          .boolean()
          .optional()
          .describe(
            "true: these titles become the whole stored set and every other stored title goes (an empty list clears them all). " +
              "Use it with the home's current chips after they change"
          ),
      },
      outputSchema: { whatsappTitles: z.record(z.string()) },
      annotations: IDEMPOTENT_WRITE,
    },
    guarded(async ({ projectId, titles, replace }) => {
      if (titles.length === 0 && replace !== true) return fail(NO_TITLES);
      const path = agentConfigPath(projectId);
      // The read-merge-write upsert_agent_config does: the server stores the
      // policy bag whole, so a PUT of {whatsappTitles} alone would drop the
      // language lock, the handoff and the write policies. One level deeper,
      // the titles merge by query the same way (null removes one), unless the
      // call replaces the set. A Map, so any query is an ordinary key.
      const current = await api.get<Record<string, unknown>>(path);
      if (!current) return fail(NO_AGENT);
      const next = new Map(replace === true ? [] : Object.entries(storedTitles(current.policies)));
      for (const { query, title } of titles) {
        if (title === null) next.delete(query);
        else next.set(query, title);
      }
      if (next.size > WHATSAPP_TITLES_MAX) return fail(tooManyTitles(next.size));
      // A call that changes nothing (the build's usual replace of an unchanged
      // home) writes nothing, so it can never overwrite a policy the owner
      // changed since the read. Compared as maps: the read comes back in the
      // server's key order, not the order the titles were sent in.
      const stored = isPlainObject(current.policies) ? current.policies.whatsappTitles : undefined;
      if (sameTitles(stored, next)) {
        return ok({ whatsappTitles: storedTitles(current.policies) });
      }
      const whatsappTitles = Object.fromEntries(next);
      // An empty set leaves the key out of the bag rather than storing {}.
      const policies = mergePolicyBag(current.policies, { whatsappTitles: next.size > 0 ? whatsappTitles : null });
      // The server refuses a bag past its limit: refuse here, before the write,
      // with what to do about it.
      const bytes = policyBagBytes(policies);
      if (bytes > POLICY_BAG_MAX_BYTES) {
        return fail(bagTooBig(bytes, policyBagBytes(mergePolicyBag(current.policies, { whatsappTitles: null }))));
      }
      const config = await api.put<Record<string, unknown>>(path, { policies });
      return ok({
        whatsappTitles: isPlainObject(config?.policies) ? storedTitles(config.policies) : whatsappTitles,
      });
    })
  );
}
