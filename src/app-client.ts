import { APP_BASE } from "./config.js";

/**
 * An answer from the BranderUX web app that is not the one the call reads: a
 * non-2xx status, or a public read's 2xx that is not JSON (AppNotJsonError).
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * A 2xx answer to a public read (`getPublic`) whose body is not JSON: a page
 * served in the route's place, never the route's own answer. Its status is
 * that 2xx.
 */
export class AppNotJsonError extends AppError {}

/** A 3xx: an answer that sends the request elsewhere, which a public read never follows. */
export const isRedirect = (status: number): boolean => status >= 300 && status < 400;

/**
 * How long one app call may take before it is abandoned. The verification
 * route runs every binding of every canned screen through the real serve
 * fetcher (maxDuration 60 on Vercel), so the ceiling sits just above it: a
 * hung app must never hold a tool result open indefinitely.
 */
const APP_TIMEOUT_MS = 65_000;

/**
 * How long a PUBLIC read may take. The app answers one from its own
 * configuration, with no fetch of its own behind it (the WhatsApp switch), so
 * a slow one is a sick or cold app, never a big answer.
 */
const PUBLIC_READ_TIMEOUT_MS = 10_000;

/**
 * The AppError a non-2xx answer means, worded from the body's
 * `error_description`, else its `error`, else its `message`, else its first
 * 300 characters.
 */
async function failureOf(response: Response, method: string, path: string): Promise<AppError> {
  const raw = await response.text();
  let detail = raw.slice(0, 300);
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const named = parsed.error_description ?? parsed.error ?? parsed.message;
    if (typeof named === "string" && named) detail = named.slice(0, 300);
  } catch {
    /* keep the raw text */
  }
  return new AppError(response.status, `${method} ${path} → ${response.status}: ${detail}`);
}

/** The body of a 2xx answer (null when it has none); a non-2xx answer throws the AppError it means. */
async function readAnswer<T>(response: Response, method: string, path: string): Promise<T | null> {
  if (!response.ok) throw await failureOf(response, method, path);
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : null;
}

/**
 * Client for the BranderUX WEB APP (`APP_BASE`), the network that serves the
 * hosted agent. It is a sibling of `api-client.ts`, not a replacement: Spring
 * owns the stored configuration, the app owns everything that must run on the
 * serve network with the serve fetcher (canned-screen verification) and what
 * only the app knows about itself (whether it has WhatsApp for owners).
 *
 * `post` carries the SAME API-audience token `api-client.ts` sends to Spring
 * (the RFC 8693 exchange result): the app forwards it to Spring's owner
 * endpoints and introspects nothing itself. `getPublic` reads what the app
 * tells anyone, so no credential rides it, and it takes only the route's own
 * JSON. A redirect is never followed: an app without the route sends a
 * request with no session cookie to its sign-in page, a 200 HTML page (the
 * app from before WhatsApp does it for GET /api/whatsapp/availability), so
 * the redirect comes back as the AppError it is, naming where it pointed. A
 * 2xx body that is not JSON throws AppNotJsonError. `post` follows redirects
 * (fetch's default).
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
    return readAnswer<T>(response, "POST", path);
  }

  async function getPublic<T>(path: string): Promise<T | null> {
    const response = await fetch(`${APP_BASE}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      // Node's fetch hands a redirect back as it is (status and Location).
      redirect: "manual",
      signal: AbortSignal.timeout(PUBLIC_READ_TIMEOUT_MS),
    });
    const location = response.headers.get("location");
    if (isRedirect(response.status) && location) {
      await response.body?.cancel();
      throw new AppError(response.status, `GET ${path} → ${response.status}: redirect to ${location.slice(0, 300)}`);
    }
    if (!response.ok) throw await failureOf(response, "GET", path);
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AppNotJsonError(response.status, `GET ${path} → ${response.status}: not JSON: ${text.slice(0, 300)}`);
    }
  }

  return { post, getPublic };
}

export type AppClient = ReturnType<typeof createAppClient>;
