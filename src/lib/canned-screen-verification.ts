import { z } from "zod";
import { AppError, type AppClient } from "../app-client.js";

/**
 * The web app's verification route. It runs on the SERVE network with the
 * SERVE fetcher, which is the whole point: only a fetch made the way serving
 * makes it proves that a canned screen will actually replay.
 */
export const VERIFY_PATH = "/api/agent/canned-screens/verify";

/** One binding's result: how many rows it really returned, or why it failed. */
export type BindingReport = {
  path: string;
  entityName: string;
  optional: boolean;
  rows: number | null;
  error: string | null;
};

/** One canned screen's result (the home, or one fixed screen). */
export type ScreenReport = {
  kind: "home" | "fixed";
  matchQuery: string;
  screenId: string;
  ok: boolean;
  bindings: BindingReport[];
};

/** The whole report, plus one plain sentence per failing screen. */
export type VerificationReport = {
  ok: boolean;
  screens: ScreenReport[];
  summary: string[];
};

/** What a caller gets when verification could not run at all. */
export type VerificationUnavailable = { unavailable: true; reason: string };

export type Verification = VerificationReport | VerificationUnavailable;

const bindingReportSchema = z
  .object({
    path: z.string(),
    entityName: z.string(),
    optional: z.boolean(),
    rows: z.number().nullable(),
    error: z.string().nullable(),
  })
  .passthrough();

const screenReportSchema = z
  .object({
    kind: z.enum(["home", "fixed"]),
    matchQuery: z.string(),
    screenId: z.string(),
    ok: z.boolean(),
    bindings: z.array(bindingReportSchema),
  })
  .passthrough();

const reportSchema = z
  .object({
    ok: z.boolean(),
    screens: z.array(screenReportSchema),
    summary: z.array(z.string()),
  })
  .passthrough();

const unavailableSchema = z
  .object({ unavailable: z.literal(true), reason: z.string() })
  .passthrough();

/**
 * The output-schema entry every tool that carries verification declares.
 * PERMISSIVE on purpose (passthrough at every level): the route may grow a
 * field before this server does, and a richer report must never turn a
 * successful write into a schema error.
 */
export const verificationSchema = z.union([reportSchema, unavailableSchema]);

/** Is this a real report, or the "could not run" answer? */
export function isReport(verification: Verification): verification is VerificationReport {
  return !("unavailable" in verification);
}

/** Why verification could not run, in one short phrase for the agent. */
function unavailableReason(error: unknown): string {
  if (error instanceof AppError) {
    if (error.status === 404) return "this app version has no verification route yet";
    return `the verification route answered ${error.status}`;
  }
  if (error instanceof Error) return error.message.slice(0, 200);
  return String(error).slice(0, 200);
}

/**
 * Run every binding of the home and of every fixed screen through the real
 * serve fetcher.
 *
 * BEST EFFORT BY CONTRACT: verification is an addition to a write that already
 * succeeded, so nothing here throws. No app client, an older app without the
 * route, a network failure or an unrecognised body all degrade to
 * `{unavailable, reason}` - never to a failed write.
 */
export async function verifyCannedScreens(
  app: AppClient | null,
  projectId: string
): Promise<Verification> {
  if (!app) {
    return { unavailable: true, reason: "this MCP server has no app client configured" };
  }
  try {
    const body = await app.post<unknown>(VERIFY_PATH, { projectId });
    const parsed = reportSchema.safeParse(body);
    if (!parsed.success) {
      return { unavailable: true, reason: "the verification route returned an unrecognised report" };
    }
    return parsed.data as VerificationReport;
  } catch (error) {
    return { unavailable: true, reason: unavailableReason(error) };
  }
}

/**
 * The publish-time notes: one line per failing screen, exactly as the route
 * wrote them. Verification that could not run adds nothing, because a note
 * nobody can act on is worse than silence.
 */
export function verificationNotes(verification: Verification): string[] {
  if (!isReport(verification)) return [];
  return verification.summary.filter((line) => typeof line === "string" && line.trim().length > 0);
}
