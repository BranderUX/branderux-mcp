import { ApiError } from "../api-client.js";

type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  /** MCP Apps: `ui.resourceUri` (+ per-response CSP) — see src/preview/app-resource.ts. */
  _meta?: Record<string, unknown>;
};

/**
 * Every tool returns BOTH shapes: `content` for models/humans reading the transcript,
 * and `structuredContent` matching the tool's outputSchema for programmatic use.
 */
export function ok(payload: unknown, structured?: Record<string, unknown>): ToolResult {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  const result: ToolResult = { content: [{ type: "text", text }] };
  const structuredContent =
    structured ??
    (payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : { result: payload });
  result.structuredContent = structuredContent;
  return result;
}

export function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Wrap a tool handler: API errors become readable tool errors, never crashes. */
export function guarded<A extends unknown[]>(
  handler: (...args: A) => Promise<ToolResult>
): (...args: A) => Promise<ToolResult> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return fail(error.message);
      }
      return fail(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}

export const CONFIRM_HINT =
  "This is a DESTRUCTIVE operation. Call again with confirm: true only after the user has explicitly approved it.";

/** Standard annotation sets — clients surface these as safety affordances. */
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export const IDEMPOTENT_WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;
