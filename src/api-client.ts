import { CONFIG } from "./config.js";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * BranderUX API client for one MCP request.
 *
 * The bearer is resolved lazily per call via `tokenProvider`, which performs the RFC
 * 8693 exchange: the caller's MCP-audience token is never sent downstream — only a
 * token minted for the API's own audience is.
 *
 * It also maps the API's conventions to agent-friendly errors:
 *  - 204 on reads = "not found" (the API's convention for absent resources)
 *  - 403 = missing scope OR owner-only resource — the body says which
 *  - 429 = rate limited; Retry-After is surfaced so the agent can pace itself
 */
export function createApiClient(tokenProvider: () => Promise<string>) {
  async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
    const bearer = await tokenProvider();
    const response = await fetch(`${CONFIG.apiBase}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });

    if (response.status === 204) return null;

    if (!response.ok) {
      const body = await response.text();
      let detail = body.slice(0, 500);
      try {
        const parsed = JSON.parse(body);
        detail = parsed.error_description || parsed.error || parsed.message || detail;
      } catch {
        /* keep raw text */
      }
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        detail = `Rate limited. Retry after ${retryAfter ?? "60"}s. ${detail}`;
      }
      if (response.status === 401) {
        detail = `Authentication failed (token expired or revoked) — the client should re-authenticate. ${detail}`;
      }
      if (response.status === 403) {
        const challenge = response.headers.get("WWW-Authenticate");
        if (challenge?.includes("insufficient_scope")) {
          detail = `Insufficient scope — re-authorize with the scope named in the challenge. ${challenge}`;
        }
      }
      throw new ApiError(response.status, `${init?.method || "GET"} ${path} → ${response.status}: ${detail}`);
    }

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : null;
  }

  return {
    get: <T>(path: string) => call<T>(path),
    post: <T>(path: string, body: unknown) =>
      call<T>(path, { method: "POST", body: JSON.stringify(body) }),
    patch: <T>(path: string, body: unknown) =>
      call<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
    put: <T>(path: string, body: unknown) =>
      call<T>(path, { method: "PUT", body: JSON.stringify(body) }),
    delete: <T>(path: string) => call<T>(path, { method: "DELETE" }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
