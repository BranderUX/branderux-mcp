import { API_RESOURCE, AUTH_ISSUER, MCP_RESOURCE } from "./config.js";

/**
 * Resource-server auth for the MCP endpoint.
 *
 * Two rules from the MCP authorization spec drive this file:
 *  1. "MCP servers MUST validate that access tokens were issued specifically for them
 *     as the intended audience" — verifyAudience() below.
 *  2. "MCP servers MUST NOT accept or transit any other tokens" — so the caller's token
 *     is never forwarded to the BranderUX API. Instead it is exchanged (RFC 8693) for a
 *     short-lived API-audience token, cached per subject token.
 */

interface JwtClaims {
  aud?: string | string[];
  exp?: number;
  scope?: string;
  clientId?: string;
  email?: string;
}

function decodeClaims(token: string): JwtClaims | null {
  const segments = token.split(".");
  if (segments.length !== 3) return null;
  try {
    const padded = segments[1] + "=".repeat((4 - (segments[1].length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64url").toString("utf8")) as JwtClaims;
  } catch {
    return null;
  }
}

export interface AudienceCheck {
  ok: boolean;
  reason?: "malformed" | "expired" | "wrong_audience";
}

/**
 * Audience + expiry check. Signature verification happens at the authorization server
 * during token exchange — a forged token cannot survive that call, so this check exists
 * to fail fast and to refuse tokens minted for a DIFFERENT resource before we ever use
 * them (the confused-deputy case the spec calls out).
 */
export function verifyAudience(token: string): AudienceCheck {
  const claims = decodeClaims(token);
  if (!claims) return { ok: false, reason: "malformed" };
  if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  const audience = claims.aud;
  const audiences = Array.isArray(audience) ? audience : audience ? [audience] : [];
  if (!audiences.some((a) => a.toLowerCase() === MCP_RESOURCE.toLowerCase())) {
    return { ok: false, reason: "wrong_audience" };
  }
  return { ok: true };
}

export function scopesOf(token: string): string[] {
  const claims = decodeClaims(token);
  return claims?.scope ? claims.scope.trim().split(/\s+/) : [];
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const exchangeCache = new Map<string, CachedToken>();

/** Small cache keyed by the subject token; entries expire 30s before the token does. */
function cacheKey(subjectToken: string): string {
  return subjectToken.slice(-32);
}

export class TokenExchangeError extends Error {}

/**
 * RFC 8693: swap the caller's MCP-audience token for an API-audience one. This is the
 * step that makes forwarding safe — the API only ever sees a token minted for itself.
 */
export async function exchangeForApiToken(subjectToken: string): Promise<string> {
  const key = cacheKey(subjectToken);
  const cached = exchangeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  // Evict dead entries so a long-lived (local dev) process never grows unbounded.
  for (const [k, v] of exchangeCache) {
    if (v.expiresAt <= Date.now()) exchangeCache.delete(k);
  }

  const claims = decodeClaims(subjectToken);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: subjectToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
    resource: API_RESOURCE,
    ...(claims?.clientId ? { client_id: claims.clientId } : {}),
  });

  const response = await fetch(`${AUTH_ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new TokenExchangeError(
      `Token exchange failed (${response.status}): ${payload.error_description || payload.error || "unknown error"}`
    );
  }

  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 300;
  exchangeCache.set(key, {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(expiresIn - 30, 30) * 1000,
  });
  return payload.access_token;
}

/** RFC 9728 protected-resource metadata document. */
export function protectedResourceMetadata(): Record<string, unknown> {
  return {
    resource: MCP_RESOURCE,
    authorization_servers: [AUTH_ISSUER],
    scopes_supported: [...(["account:read", "projects:read", "projects:write", "elements:read", "elements:write", "keys:manage"] as const)],
    bearer_methods_supported: ["header"],
    resource_name: "BranderUX MCP",
    resource_documentation: "https://branderux.com/mcp",
  };
}

/**
 * RFC 6750 challenge. The spec asks servers to name the scopes needed AND point at the
 * metadata document, so a client can complete (or step up) authorization unattended.
 */
export function challengeHeader(scope?: string, error?: string): string {
  const parts = [
    `resource_metadata="${MCP_RESOURCE.replace(/\/mcp$/, "")}/.well-known/oauth-protected-resource"`,
  ];
  if (error) parts.unshift(`error="${error}"`);
  parts.push(`scope="${scope ?? "account:read projects:read projects:write elements:read elements:write"}"`);
  return `Bearer ${parts.join(", ")}`;
}
