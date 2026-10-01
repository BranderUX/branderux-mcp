import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import { OPEN_WORLD_IDEMPOTENT_WRITE, READ_ONLY, fail, guarded, ok } from "./helpers.js";
import { mapCrmStatus } from "../lib/owner-data-map.js";
import { isPlainObject } from "../lib/policy-bag.js";

const projectIdSchema = z.string().uuid();
const recordIdSchema = z.string().uuid();

const projectPath = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`;

/**
 * The owner's CRM sync as an AI client sees it (plan 4.13 "MCP"): the status,
 * and ONE record sent to the CRM the owner already connected. Connecting,
 * reconnecting, disconnecting and what goes there are the choices of a
 * signed-in person, the owner or a manager, in the Agent tab: there is no
 * tool for them, and the send takes no destination, so text planted in a
 * lead can never point records at another CRM. No token, account id or
 * setting beyond "what goes" ever reaches a result. Neither tool is on the
 * in-app Builder's allowlist.
 */
export function registerOwnerCrmTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "get_crm_status",
    {
      title: "CRM sync status",
      description:
        "Whether the owner's CRM (HubSpot, monday CRM, Fireberry or Google Sheets) receives the leads, bookings, orders and " +
        "requests the agent collects: which one, its state, the last send, how many records are waiting or need attention, " +
        "and why. Connecting, reconnecting, disconnecting and what goes there are set only by a signed-in person, the owner " +
        "or a manager, in the Agent tab.",
      inputSchema: { projectId: projectIdSchema },
      outputSchema: {
        connected: z.boolean(),
        provider: z.string().nullable(),
        providerLabel: z.string().nullable(),
        status: z.string().nullable(),
        accountLabel: z.string().nullable(),
        lastSentAt: z.string().nullable(),
        waiting: z.number(),
        needsAttention: z.number(),
        held: z.number(),
        problems: z.array(z.object({ cause: z.string(), count: z.number(), message: z.string() })),
        whatGoes: z
          .object({ excludedEntities: z.array(z.string()), includeConversation: z.boolean() })
          .nullable(),
      },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId }) => {
      const status = await api.get<unknown>(`${projectPath(projectId)}/crm`);
      return ok(mapCrmStatus(status));
    })
  );

  server.registerTool(
    "send_record_to_crm",
    {
      title: "Send one record to the CRM",
      description:
        "Send ONE collected record to the CRM the owner already connected. There is no destination to choose. A record " +
        "that is already there returns its link, and one already on its way returns queued; neither counts. At most 20 a " +
        "day per project; records you add with add_record go only this way, and you cannot send records of a type the " +
        "owner left out of the CRM.",
      inputSchema: { projectId: projectIdSchema, recordId: recordIdSchema },
      outputSchema: { state: z.string(), url: z.string().nullable() },
      annotations: OPEN_WORLD_IDEMPOTENT_WRITE,
    },
    guarded(async ({ projectId, recordId }) => {
      const answer = await api.post<unknown>(
        `${projectPath(projectId)}/records/${encodeURIComponent(recordId)}/send-to-crm`,
        undefined
      );
      if (!isPlainObject(answer) || typeof answer.state !== "string") {
        return fail("The CRM send answered without a state. Check the record in the owner's Inbox before sending again.");
      }
      return ok({ state: answer.state, url: typeof answer.url === "string" ? answer.url : null });
    })
  );
}
