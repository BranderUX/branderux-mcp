import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import { CONFIRM_HINT, DESTRUCTIVE, IDEMPOTENT_WRITE, READ_ONLY, WRITE, fail, guarded, ok } from "./helpers.js";

export function registerKeyTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "create_api_key",
    {
      title: "Create API key",
      description:
        "Create a project API key (bux_pk_…) for the SDK embed. The raw key is returned ONCE — relay it to the user immediately. Limit: 2 active keys per project.",
      inputSchema: {
        projectId: z.string().uuid(),
        label: z.string().min(1).max(255),
        allowedOrigins: z
          .array(z.string().url())
          .max(20)
          .describe("Exact origins allowed to exchange this key (no wildcards), e.g. https://shop.example.com"),
      },
      outputSchema: {
        id: z.string(),
        rawKey: z.string(),
        keyPrefix: z.string(),
        label: z.string(),
        note: z.string(),
      },
      annotations: WRITE,
    },
    guarded(async ({ projectId, label, allowedOrigins }) => {
      const created = await api.post<Record<string, unknown>>(`/projects/${projectId}/api-keys`, {
        label,
        allowedOrigins,
      });
      // EXPLICIT field construction — never spread an API response into
      // structuredContent: clients validate against the serialized schema
      // with additionalProperties:false, so any extra server field makes the
      // call fail AFTER the key was created (the raw secret is then lost).
      const record = created ?? {};
      return ok({
        id: String(record.id ?? ""),
        rawKey: String(record.rawKey ?? ""),
        keyPrefix: String(record.keyPrefix ?? ""),
        label: String(record.label ?? label),
        note: "Store rawKey now — it is never shown again. Revocation propagates within ~5 minutes.",
      });
    })
  );

  server.registerTool(
    "list_api_keys",
    {
      title: "List API keys",
      description: "List a project's ACTIVE API keys (prefix, label, origins, lastUsedAt — never the raw key).",
      inputSchema: { projectId: z.string().uuid() },
      outputSchema: { keys: z.array(z.object({}).passthrough()) },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId }) => {
      const keys = await api.get<Record<string, unknown>[]>(`/projects/${projectId}/api-keys`);
      return ok({ keys: keys ?? [] });
    })
  );

  server.registerTool(
    "set_key_origins",
    {
      title: "Set key origins",
      description: "Replace (not merge) the allowed-origins list of an API key.",
      inputSchema: {
        projectId: z.string().uuid(),
        keyId: z.string().uuid(),
        allowedOrigins: z.array(z.string().url()).max(20),
      },
      outputSchema: { key: z.object({}).passthrough() },
      annotations: IDEMPOTENT_WRITE,
    },
    guarded(async ({ projectId, keyId, allowedOrigins }) => {
      const updated = await api.put<Record<string, unknown>>(
        `/projects/${projectId}/api-keys/${keyId}/origins`,
        { allowedOrigins }
      );
      return ok({ key: updated ?? {} });
    })
  );

  server.registerTool(
    "revoke_api_key",
    {
      title: "Revoke API key",
      description: `Revoke a project API key. Existing embeds using it stop working within ~5 minutes. ${CONFIRM_HINT}`,
      inputSchema: { projectId: z.string().uuid(), keyId: z.string().uuid(), confirm: z.boolean().default(false) },
      outputSchema: { revoked: z.string(), note: z.string() },
      annotations: DESTRUCTIVE,
    },
    guarded(async ({ projectId, keyId, confirm }) => {
      if (!confirm) return fail(CONFIRM_HINT);
      await api.delete(`/projects/${projectId}/api-keys/${keyId}`);
      return ok({ revoked: keyId, note: "Propagates within ~5 minutes." });
    })
  );
}
