import { APP_BASE } from "./config.js";

/** A non-2xx (or unreachable) answer from the BranderUX web app. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * How long one app call may take before it is abandoned. The verification
 * route runs every binding of every canned screen through the real serve
 * fetcher (maxDuration 60 on Vercel), so the ceiling sits just above it: a
 * hung app must never hold a tool result open indefinitely.
 */
const APP_TIMEOUT_MS = 65_000;

/**
 * Client for the BranderUX WEB APP (`APP_BASE`), the network that serves the
 * hosted agent. It is a sibling of `api-client.ts`, not a replacement: Spring
 * owns the stored configuration, the app owns everything that must run on the
 * serve network with the serve fetcher (canned-screen verification).
 *
 * The bearer is the SAME API-audience token `api-client.ts` sends to Spring
 * (the RFC 8693 exchange result): the app forwards it to Spring's owner
 * endpoints and introspects nothing itself.
 */
export function createAppClient(tokenProvider: () => Promise<string>) {
  async function post<T>(path: string, body: unknown): Promise<T | null> {
    const bearer = await tokenProvider();
    const response = await fetch(`${APP_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(APP_TIMEOUT_MS),
    });

    if (!response.ok) {
      const raw = await response.text();
      let detail = raw.slice(0, 300);
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const named = parsed.error_description ?? parsed.error ?? parsed.message;
        if (typeof named === "string" && named) detail = named.slice(0, 300);
      } catch {
        /* keep the raw text */
      }
      throw new AppError(response.status, `POST ${path} → ${response.status}: ${detail}`);
    }

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : null;
  }

  return { post };
}

export type AppClient = ReturnType<typeof createAppClient>;
