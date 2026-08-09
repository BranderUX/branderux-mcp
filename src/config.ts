/** Environment-driven configuration with local-dev defaults. */
export const CONFIG = {
  /** BranderUX Spring API base (includes /api/v1). */
  apiBase: process.env.BRANDER_API_BASE || "http://localhost:8080/api/v1",
  /** Public URL of THIS MCP server. */
  resourceUrl: process.env.MCP_RESOURCE_URL || "http://localhost:3010",
} as const;

/** OAuth authorization server issuer = the Spring API base. */
export const AUTH_ISSUER = process.env.OAUTH_ISSUER_URL || CONFIG.apiBase;

/**
 * RFC 8707 canonical resource URI of this MCP server. Tokens MUST carry this as
 * their audience — a token minted for the API (or anything else) is rejected, which
 * is what stops a token issued elsewhere being replayed here.
 */
export const MCP_RESOURCE = `${CONFIG.resourceUrl}/mcp`;

/** The audience of the downstream API, obtained via RFC 8693 token exchange. */
export const API_RESOURCE = process.env.BRANDER_API_RESOURCE || CONFIG.apiBase;

/** Scopes advertised in protected-resource metadata and 401 challenges. */
export const SUPPORTED_SCOPES = [
  "account:read",
  "projects:read",
  "projects:write",
  "elements:read",
  "elements:write",
  "keys:manage",
] as const;

/**
 * The BranderUX web app that pairs with the configured API — playground links
 * in tool results point here. Override with BRANDER_APP_BASE when the mapping
 * doesn't hold (e.g. fully local stacks).
 */
export const APP_BASE = (() => {
  const override = process.env.BRANDER_APP_BASE;
  if (override) return override.replace(/\/$/, "");
  if (CONFIG.apiBase.includes("api-dev.branderux.com")) return "https://dev.branderux.com";
  if (CONFIG.apiBase.includes("api.branderux.com")) return "https://branderux.com";
  return "http://localhost:3000";
})();
