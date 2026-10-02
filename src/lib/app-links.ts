import { APP_BASE } from "../config.js";

/** The Agent tab's sections the web app opens by name (its `section` param). */
export type AgentSection = "overview" | "inbox" | "conversations" | "analytics" | "audience" | "catalog";

export interface AgentLinkOptions {
  /** The record to open (Inbox). */
  record?: string;
  /** The conversation to open (Conversations). */
  session?: string;
  /** Open Inbox settings. */
  settings?: boolean;
  /** Open Your CRM, the Inbox's CRM dialog; a known provider opens that CRM's screen. */
  crm?: string;
}

/**
 * A one-click link into a project's Agent tab in the web app, so the owner's
 * AI can say exactly where to do what it cannot do itself. The params are the
 * web app's own (its agent-url.ts): `project` switches to the project, and a
 * `crm` opens Your CRM (that CRM's screen for a known provider).
 */
export function agentTabLink(projectId: string, section: AgentSection, options: AgentLinkOptions = {}): string {
  const params: [string, string][] = [
    ["tab", "agent"],
    ["project", projectId],
    ["section", section],
  ];
  if (options.record) params.push(["record", options.record]);
  if (options.session) params.push(["session", options.session]);
  if (options.settings) params.push(["settings", "1"]);
  if (options.crm) params.push(["crm", options.crm]);
  const query = params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
  return `${APP_BASE}/projects?${query}`;
}

/** Your CRM, the Inbox's CRM dialog: that CRM's screen when one is connected, else its choices. */
export function crmManageLink(projectId: string, provider: string | null): string {
  return agentTabLink(projectId, "inbox", { crm: provider ?? "connect" });
}
