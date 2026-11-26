import { z } from "zod";
import { siteDirection, siteLanguage, type SiteDirection } from "../lib/site-direction.js";
import {
  buildActionsContract,
  declaresLegacyPrimaryShim,
  deriveInteraction,
  parseTemplateSpec,
} from "../lib/element-actions.js";
import { transform } from "sucrase";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import { CONFIRM_HINT, DESTRUCTIVE, READ_ONLY, WRITE, errorText, fail, guarded, ok } from "./helpers.js";
import { applyEdits, type EditFailure } from "../lib/apply-edits.js";
import { otherPinsIn, repinScreen, screenPinsVersion, type OtherPin } from "../lib/screen-repin.js";
import { buildPreviewPayload, extractImageOrigins } from "../preview/compile.js";
import { normalizeBrandForPanel } from "../playground/generate-screen.js";
import { PREVIEW_RESOURCE_URI, isPreviewAppAvailable, previewMeta } from "../preview/app-resource.js";

/**
 * Custom-element tools. The AGENT writes the element code itself (it knows the
 * customer's product); these tools validate against the authoring contract and
 * publish. No BranderUX AI is involved — versions are submitted with
 * extractionStatus "succeeded", exactly like a hand-authored seed.
 */

const ALLOWED_IMPORTS = new Set([
  "react",
  "@mui/material",
  "@mui/system",
  "@emotion/react",
  "@emotion/styled",
  "lucide-react",
  "recharts",
  "framer-motion",
  "date-fns",
]);

/** The code's declared on*ContextMenu prop (optional Props field), if any. */
export function detectRightClickProp(code: string): string | null {
  const match = code.match(/\b(on[A-Z][A-Za-z0-9]*ContextMenu)\s*\?\s*:/);
  return match ? (match[1] as string) : null;
}

/** Compile with sucrase + enforce the sandbox import allowlist and export contract. */
export function validateElementCode(code: string, kind: "component" | "skeleton"): string[] {
  const problems: string[] = [];
  try {
    transform(code, { transforms: ["typescript", "jsx"] });
  } catch (error) {
    problems.push(`Does not compile: ${error instanceof Error ? error.message : String(error)}`);
    return problems;
  }
  for (const match of code.matchAll(/from\s+["']([^"']+)["']/g)) {
    const source = match[1];
    const root = source.startsWith("@") ? source.split("/").slice(0, 2).join("/") : source.split("/")[0];
    if (!ALLOWED_IMPORTS.has(root) && !ALLOWED_IMPORTS.has(source)) {
      problems.push(`Import '${source}' is not in the sandbox allowlist (${[...ALLOWED_IMPORTS].join(", ")}).`);
    }
  }
  if (kind === "component") {
    if (!/export\s+default\s+function\s+Component\s*\(/.test(code)) {
      problems.push("The component must be `export default function Component(...)` — exactly that name.");
    }
    if (!/export\s+interface\s+Props\b/.test(code)) {
      problems.push("The file must `export interface Props` describing every prop (no defaults on props).");
    }
    // Links inside elements open in a new tab: the element frame allows popups but never
    // top-level navigation, so an href WITHOUT target="_blank" loads its destination inside
    // the element's own frame. Fragment links (href="#…") stay in-document and are allowed.
    for (const tag of code.matchAll(/<[A-Za-z][\w.]*\b[^>]*\bhref\s*=[^>]*>/g)) {
      const text = tag[0];
      if (/\bhref\s*=\s*["']#/.test(text) || /\btarget\s*=/.test(text)) continue;
      problems.push(
        'A link without target="_blank" loads its destination inside the element\'s own frame — add target="_blank" rel="noopener" to every <a>/<Link> with an href (fragment links "#…" excepted).'
      );
      break;
    }
  } else if (!/export\s+default\s+function\s+SkeletonComponent\s*\(/.test(code)) {
    problems.push("The skeleton must be `export default function SkeletonComponent()`.");
  }
  return problems;
}

const RIGHT_CLICK_PROP = /contextmenu|rightclick/i;

interface WiringInput {
  code: string;
  propsSchema: Record<string, unknown>;
  clickQueryTemplate: string | null;
  interactionPropName: string | null;
}

/**
 * Pre-flight for ACTION WIRING. The runtime, `list_elements` and the panel
 * preview must agree on which callback is primary — and the runtime DERIVES
 * it from callback names (`deriveInteraction`), never from the stored
 * interactionPropName. A declared primary that derivation disagrees with, or
 * a `$primary`/plain-string template when nothing derives as primary, ships a
 * template the runtime never sends (the click falls back to a generic query)
 * while the preview shows it working. Fail loudly with the remedy instead.
 */
export function checkInteractionWiring(input: WiringInput): string[] {
  const problems: string[] = [];
  const derived = deriveInteraction(input.code, input.propsSchema);
  const callbacks = [...(derived.actionProp ? [derived.actionProp] : []), ...derived.extraActionProps];
  const listed = callbacks.length ? callbacks.join(", ") : "none";
  const mapForm = `{${callbacks.map((name) => `"${name}": "..."`).join(", ")}}`;
  const noPrimaryReason =
    `with ${callbacks.length} callbacks (${listed}) and no select/click/open/view/press-flavored name there is NO primary`;
  const declared = input.interactionPropName?.trim() || null;
  // The pre-extraction shim: the runtime binds `onAction` as the primary
  // left-click handler on every element and resolves the PRIMARY template for
  // it, so a Props whose only callback is `onAction` still sends a plain /
  // `$primary` template. Derivation reports no callbacks for it by design
  // (list_elements and the runtime registry agree) — honour it here only.
  const shimDeclared = declaresLegacyPrimaryShim(input.code, input.propsSchema);
  const legacyOnly = shimDeclared && callbacks.length === 0;

  if (declared && declared !== derived.actionProp && !(legacyOnly && declared === "onAction")) {
    if (RIGHT_CLICK_PROP.test(declared)) {
      problems.push(
        `interactionPropName "${declared}" is the right-click prop, not an action — it is detected automatically; pass the primary action callback or null.`
      );
    } else if (declared === "onAction" && shimDeclared) {
      problems.push(
        `interactionPropName "onAction" is the legacy primary shim, not a derived primary: ` +
          (derived.actionProp
            ? `the runtime derives "${derived.actionProp}" — set interactionPropName to it (or null).`
            : `${noPrimaryReason} — set interactionPropName to null and key EVERY template by its callback name in the JSON map form: ${mapForm}.`)
      );
    } else if (!callbacks.includes(declared)) {
      problems.push(
        `interactionPropName "${declared}" is not a callback declared in Props (declared: ${listed}). Declare it as an optional \`on*?: (...) => void\` prop, or pass null.`
      );
    } else if (derived.actionProp === null) {
      problems.push(
        `interactionPropName "${declared}" cannot be the primary: the primary is DERIVED from callback names, and ${noPrimaryReason}. ` +
          `Rename the callback to a flavored name (e.g. onSelectItem), or set interactionPropName to null and key EVERY template by its callback name in the JSON map form: ${mapForm}.`
      );
    } else {
      problems.push(
        `interactionPropName "${declared}" disagrees with derivation: the runtime derives "${derived.actionProp}" as the primary (first well-known or flavored callback name). ` +
          `Set interactionPropName to "${derived.actionProp}" (or null) and put "${declared}"'s template under its own key in the JSON map: {"$primary": "...", "${declared}": "..."}.`
      );
    }
  }

  const spec = parseTemplateSpec(input.clickQueryTemplate);
  if (spec.primary !== null && derived.actionProp === null && !legacyOnly) {
    problems.push(
      callbacks.length === 0
        ? "clickQueryTemplate carries a primary template but Props declares no action callback — nothing can ever send it. Declare an action-named callback (e.g. onSelectItem?: (item) => void) or pass clickQueryTemplate null."
        : `clickQueryTemplate's primary template ("$primary" or a plain string) is orphaned: ${noPrimaryReason}, so the runtime never sends it. ` +
          `Rename one callback to a flavored name, or key EVERY template by its callback name in the JSON map form: ${mapForm}.`
    );
  }
  return problems;
}

interface WireVersionPayload {
  version?: number;
  code?: string;
  propsSchema?: Record<string, unknown> | null;
  defaultProps?: Record<string, unknown>;
  clickQueryTemplate?: string | null;
  interactionPropName?: string | null;
}

/** One row of GET /elements/{id}/versions, projected to what an agent can act on. */
interface WireVersionRow {
  version?: number;
  createdAt?: string;
  prompt?: string | null;
  codeSha256?: string | null;
  interactionPropName?: string | null;
  extractionStatus?: string | null;
}

/**
 * Attach the element-preview MCP App to a tool result: the preview payload rides
 * in structuredContent (matching the app's ontoolresult reader) and `_meta.ui`
 * points hosts at the app resource. Hosts without apps support see text only.
 */
function withPreview(
  result: ReturnType<typeof ok>,
  source: { name: string; version?: number; panel?: PanelContext } & WireVersionPayload
): ReturnType<typeof ok> {
  if (!isPreviewAppAvailable() || !source.code) return result;
  // No interactionPropName here on purpose: the payload's primary is DERIVED
  // from code + propsSchema (buildPreviewPayload), never the stored field.
  const preview = buildPreviewPayload({
    name: source.name,
    version: source.version,
    code: source.code,
    propsSchema: source.propsSchema,
    defaultProps: source.defaultProps,
    clickQueryTemplate: source.clickQueryTemplate,
  });
  if (!preview) return result;
  if (source.panel?.brandSettings) preview.brandSettings = source.panel.brandSettings;
  if (source.panel?.language) preview.language = source.panel.language;
  if (source.panel?.direction) preview.direction = source.panel.direction;
  return {
    ...result,
    structuredContent: { ...(result.structuredContent ?? {}), preview },
    _meta: previewMeta(extractImageOrigins(source.defaultProps)),
  };
}

interface PanelContext {
  brandSettings?: Record<string, unknown>;
  language?: string;
  direction?: SiteDirection;
}

/**
 * Project brand + language for preview theming — fail-soft (the preview stays
 * neutral / LTR). The language comes from the hosted agent config; a project
 * without one previews left-to-right, exactly like its site.
 */
async function fetchPanelContext(api: ApiClient, projectId: string): Promise<PanelContext> {
  const context: PanelContext = {};
  try {
    const project = await api.get<{ brandSettings?: Record<string, unknown> }>(
      `/projects/${projectId}`
    );
    // normalizeBrandForPanel's darkMode: true default mirrors the client's
    // normalizeBrandSettings (defaultSettings.darkMode: true): a brand that
    // never set darkMode renders DARK on the site, so the panel must too.
    if (project?.brandSettings) context.brandSettings = normalizeBrandForPanel(project.brandSettings);
  } catch {
    /* neutral preview */
  }
  try {
    const config = await api.get<{ policies?: Record<string, unknown> }>(
      `/projects/${projectId}/agent-config`
    );
    const language = siteLanguage(config);
    if (language) {
      context.language = language;
      context.direction = siteDirection(language);
    }
  } catch {
    /* no hosted agent → LTR */
  }
  return context;
}


/** The current version as GET /elements/{id} returns it (Spring's CustomElementVersionResponse). */
interface StoredVersionPayload extends Omit<WireVersionPayload, "defaultProps" | "version"> {
  version?: number | null;
  defaultProps?: Record<string, unknown> | null;
  previewWrapperCode?: string | null;
  skeletonCode?: string | null;
  toolSchema?: Record<string, unknown> | null;
  structurePrompt?: string | null;
  rightClickPropName?: string | null;
  clickArgIsObject?: boolean | null;
  extractionStatus?: string | null;
}

/**
 * The version edit_element appends: the edited code, and every other field of the current version
 * carried forward unchanged. Two fields follow the code, as publish_element_version derives them:
 * the right-click prop (a stored name the edited code still mentions is kept) and the prompt, which
 * records the edit. Spring serializes nulls, so a stored `toolSchema: null` (a tool-disabled element)
 * stays null; only a payload without the key at all gets publish_element_version's tool schema.
 */
function nextVersionBody(
  current: StoredVersionPayload,
  code: string,
  description: string | undefined,
  editCount: number
): Record<string, unknown> {
  const storedRightClick = current.rightClickPropName ?? null;
  return {
    code,
    previewWrapperCode: current.previewWrapperCode ?? null,
    skeletonCode: current.skeletonCode ?? null,
    prompt: `Edited by the customer's agent via the BranderUX MCP (edit_element, ${editCount} ${editCount === 1 ? "edit" : "edits"}).`,
    propsSchema: current.propsSchema ?? null,
    defaultProps: current.defaultProps ?? null,
    toolSchema:
      "toolSchema" in current
        ? (current.toolSchema ?? null)
        : { description: description ?? "", input_schema: current.propsSchema ?? { type: "object", properties: {} } },
    structurePrompt: current.structurePrompt ?? null,
    clickQueryTemplate: current.clickQueryTemplate ?? null,
    interactionPropName: current.interactionPropName ?? null,
    rightClickPropName:
      detectRightClickProp(code) ?? (storedRightClick && code.includes(storedRightClick) ? storedRightClick : null),
    clickArgIsObject: current.clickArgIsObject ?? true,
    extractionStatus: current.extractionStatus ?? "succeeded",
  };
}

/** An element as GET /elements/{id} returns it (Spring's CustomElementResponse), as edit_element reads it. */
interface StoredElement {
  name?: string;
  elementKey?: string;
  description?: string;
  status?: string;
  currentVersion?: number | null;
  currentVersionPayload?: StoredVersionPayload | null;
}

/** Why edit_element refused to publish over a version another client published meanwhile. */
function staleVersionText(elementId: string, baseVersion: number, latestVersion: number | undefined): string {
  const now =
    latestVersion === undefined
      ? "its current version number can no longer be read"
      : `its current version is now v${latestVersion}: another client published it while this call ran`;
  return [
    `edit_element refused the call: the edits were applied to v${baseVersion} of element ${elementId}, but ${now}.`,
    "Nothing was published and no screen was touched.",
    "Read the current code with get_element and call edit_element again, with every search copied from that code.",
  ].join(" ");
}

/** Why edit_element refused the call, one line per failed edit, numbered from 1. */
function editFailureText(failures: EditFailure[], total: number): string {
  return [
    "edit_element refused the call: nothing was changed, no version was published and no screen was touched.",
    ...failures.map((failure) => `- Edit ${failure.index + 1} of ${total} (${failure.reason}): ${failure.hint}`),
    "Fix the edits above and send the call again with every edit, the ones that matched too.",
  ].join("\n");
}

interface RepinOutcome {
  repinnedScreens: string[];
  repinFailures: { screenId: string; error: string }[];
  otherPins: OtherPin[];
}

/** The project's stored screens (Spring has no read for one screen: it comes with the project). */
async function readProjectScreens(api: ApiClient, projectId: string): Promise<Record<string, unknown>[]> {
  const project = await api.get<{ customScreens?: unknown }>(`/projects/${projectId}`);
  const stored = project?.customScreens;
  return Array.isArray(stored)
    ? stored.filter((screen): screen is Record<string, unknown> => typeof screen === "object" && screen !== null)
    : [];
}

/**
 * Move every placement of this element pinned to `editedVersion` (the version the edit was applied
 * to) to `publishedVersion`, ONE SCREEN AT A TIME: parallel saves of one project's screens
 * overwrite each other. Pins to any other version stay as they are and come back in `otherPins`.
 *
 * Each screen is read again immediately before its own PUT and the change is applied to that fresh
 * copy, so a save from the Screen Builder or another tool that landed since the first read is kept;
 * a screen that no longer pins `editedVersion` (or is gone) is skipped. The remaining window is one
 * request wide: a save landing between that read and its PUT is still overwritten, because the
 * server's screen PUT has no conditional write (it takes no version to check against).
 *
 * A screen that fails is reported, never fatal (the version is already published).
 */
async function repinProjectScreens(
  api: ApiClient,
  projectId: string,
  elementKey: string,
  editedVersion: number,
  publishedVersion: number
): Promise<RepinOutcome> {
  const outcome: RepinOutcome = { repinnedScreens: [], repinFailures: [], otherPins: [] };
  // The newest read of the project's screens; otherPins is taken from it at the end.
  let latest: Record<string, unknown>[];
  try {
    latest = await readProjectScreens(api, projectId);
  } catch (error) {
    outcome.repinFailures.push({
      screenId: "*",
      error: `Could not read the project's screens, so none was re-pinned: ${errorText(error)}`,
    });
    return outcome;
  }
  const candidates = latest.filter((screen) => screenPinsVersion(screen, elementKey, editedVersion));
  for (const candidate of candidates) {
    const screenId = typeof candidate.id === "string" ? candidate.id : "";
    if (!screenId) {
      outcome.repinFailures.push({ screenId, error: "This screen has no id, so it cannot be put back." });
      continue;
    }
    try {
      latest = await readProjectScreens(api, projectId);
    } catch (error) {
      outcome.repinFailures.push({
        screenId,
        error: `Could not read this screen again right before re-pinning it, so it was left alone: ${errorText(error)}`,
      });
      continue;
    }
    const fresh = latest.find((screen) => screen.id === screenId);
    const wire = fresh ? repinScreen(fresh, elementKey, editedVersion, publishedVersion) : null;
    if (!wire) continue;
    try {
      await api.put(`/projects/${projectId}/screens/${encodeURIComponent(screenId)}`, wire);
      outcome.repinnedScreens.push(screenId);
    } catch (error) {
      outcome.repinFailures.push({ screenId, error: errorText(error) });
    }
  }
  outcome.otherPins = otherPinsIn(latest, elementKey, editedVersion, publishedVersion);
  return outcome;
}

/** The version number of an element's current code: the payload's own, else the element's pointer. */
function currentVersionOf(element: {
  currentVersion?: number | null;
  currentVersionPayload?: { version?: number | null } | null;
}): number | undefined {
  const fromPayload = element.currentVersionPayload?.version;
  if (typeof fromPayload === "number") return fromPayload;
  return typeof element.currentVersion === "number" ? element.currentVersion : undefined;
}

/** The actions contract for `actionHandlers` wiring — assembled from the version payload. */
function actionsFor(element: Record<string, unknown>): ReturnType<typeof buildActionsContract> {
  const payload = element.currentVersionPayload as
    | {
        code?: string;
        propsSchema?: Record<string, unknown> | null;
        defaultProps?: Record<string, unknown> | null;
        clickQueryTemplate?: string | null;
      }
    | null
    | undefined;
  if (!payload?.code) return [];
  return buildActionsContract({
    code: payload.code,
    propsSchema: payload.propsSchema ?? null,
    defaultProps: payload.defaultProps ?? null,
    clickQueryTemplate: payload.clickQueryTemplate ?? null,
    elementKey: typeof element.elementKey === "string" ? element.elementKey : null,
  });
}

export function registerElementTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "list_elements",
    {
      title: "List custom elements",
      description: "List a project's custom elements (key, name, status, current version) incl. the actions contract: actions[].name are the EXACT actionHandlers keys (actions[].scopedKey targets only that element when names collide), with meaning, itemShape and exampleItem per action.",
      inputSchema: { projectId: z.string().uuid() },
      outputSchema: { elements: z.array(z.object({}).passthrough()) },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId }) => {
      const elements = await api.get<Record<string, unknown>[]>(
        `/projects/${projectId}/elements?includeDrafts=true`
      );
      return ok({
        elements: (elements ?? []).map((e) => ({
          id: e.id,
          elementKey: e.elementKey,
          name: e.name,
          status: e.status,
          currentVersion: e.currentVersion,
          description: e.description,
          // For actionHandlers wiring: actions[].name are the EXACT prop keys.
          // Drafts excluded — their actions cannot fire until published.
          actions: e.status === "published" ? actionsFor(e) : [],
        })),
      });
    })
  );

  server.registerTool(
    "get_element",
    {
      title: "Get custom element",
      description: "Get one custom element including its current version's code and metadata.",
      inputSchema: { projectId: z.string().uuid(), elementId: z.string().uuid() },
      outputSchema: { element: z.object({}).passthrough() },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId, elementId }) => {
      const element = await api.get<Record<string, unknown>>(`/projects/${projectId}/elements/${elementId}`);
      if (!element) return fail(`Element ${elementId} not found.`);
      return ok({ element: { ...element, actions: actionsFor(element) } });
    })
  );

  server.registerTool(
    "list_element_versions",
    {
      title: "List element versions",
      description:
        "List every version of one custom element, newest first (version, createdAt, prompt, codeSha256, interactionPropName, extractionStatus) — the checkable record of what was published when. Use it to verify a publish landed and which number to pin in screens; the number publish_element_version RETURNS is authoritative, never a remembered one.",
      inputSchema: { projectId: z.string().uuid(), elementId: z.string().uuid() },
      outputSchema: { elementId: z.string(), versions: z.array(z.object({}).passthrough()) },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId, elementId }) => {
      const rows = await api.get<WireVersionRow[]>(`/projects/${projectId}/elements/${elementId}/versions`);
      const versions = (rows ?? [])
        .map((row) => ({
          version: row.version ?? null,
          createdAt: row.createdAt ?? null,
          prompt: row.prompt ?? null,
          codeSha256: row.codeSha256 ?? null,
          interactionPropName: row.interactionPropName ?? null,
          extractionStatus: row.extractionStatus ?? null,
        }))
        .sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
      return ok({ elementId, versions });
    })
  );

  server.registerTool(
    "preview_element",
    {
      title: "Preview custom element",
      description:
        "Render a published custom element live (with its demo props) in the client's app panel — clicks show the exact query they would send. In clients without MCP Apps support this returns the element data as text.",
      inputSchema: { projectId: z.string().uuid(), elementId: z.string().uuid() },
      outputSchema: {
        element: z.object({}).passthrough(),
        preview: z.object({}).passthrough().optional(),
      },
      annotations: READ_ONLY,
      _meta: {
        ui: { resourceUri: PREVIEW_RESOURCE_URI },
        "ui/resourceUri": PREVIEW_RESOURCE_URI,
      },
    },
    guarded(async ({ projectId, elementId }) => {
      const element = await api.get<{
        id?: string;
        elementKey?: string;
        name?: string;
        status?: string;
        currentVersionPayload?: WireVersionPayload;
      }>(`/projects/${projectId}/elements/${elementId}`);
      if (!element) return fail(`Element ${elementId} not found.`);
      const payload = element.currentVersionPayload;
      if (!payload?.code) {
        return fail(`Element ${elementId} has no version code to preview.`);
      }
      const summary = {
        id: element.id,
        elementKey: element.elementKey,
        name: element.name,
        status: element.status,
        version: payload.version,
      };
      const result = ok(
        `Previewing "${element.name}" v${payload.version ?? "?"} — the panel renders it live; interactions show the query they would send.`,
        { element: summary }
      );
      return withPreview(result, {
        name: element.name ?? element.elementKey ?? "Custom element",
        ...payload,
        panel: await fetchPanelContext(api, projectId),
      });
    })
  );

  server.registerTool(
    "create_element",
    {
      title: "Create custom element",
      description:
        "Create AND publish a custom element from agent-written TSX. Pre-flight validates the code (compile + sandbox import allowlist + export contract) AND the action wiring (the primary is DERIVED from callback names; a $primary template with no derivable primary, or an interactionPropName derivation disagrees with, is rejected with the remedy) before anything is sent. Read the custom-elements-contract doc first — including its direction-neutral layout rule: space siblings with flex/grid gap, never left/right margins or any physical side, so the element renders correctly on RTL sites too. In clients with MCP Apps support the published element renders live in the panel.",
      annotations: WRITE,
      outputSchema: {
        element: z.object({}).passthrough(),
        preview: z.object({}).passthrough().optional(),
      },
      _meta: {
        ui: { resourceUri: PREVIEW_RESOURCE_URI },
        "ui/resourceUri": PREVIEW_RESOURCE_URI,
      },
      inputSchema: {
      projectId: z.string().uuid(),
      name: z.string().min(1).max(80).describe("Display name; the element key is derived server-side"),
      description: z.string().min(1).max(500),
      category: z.enum(["data", "media", "interactive", "custom"]),
      iconName: z.string().min(1).describe("lucide-react icon name, e.g. 'ShoppingBag'"),
      code: z.string().min(1).describe("Inner component TSX: export interface Props + export default function Component"),
      skeletonCode: z.string().optional().describe("Loading skeleton: export default function SkeletonComponent, Box/Skeleton/Stack only"),
      propsSchema: z.object({}).passthrough().describe("JSON Schema of Props"),
      defaultProps: z.object({}).passthrough().describe("Realistic demo props matching propsSchema"),
      structurePrompt: z.string().min(1).describe("When-to-use + data guidance for the runtime AI (no layout directives)"),
      clickQueryTemplate: z
        .string()
        .nullable()
        .describe("Primary click query template with {field} tokens, or a JSON map {\"$primary\": ..., \"onX\": ...}; null for non-interactive"),
      interactionPropName: z.string().nullable().describe("Primary callback prop, e.g. 'onSelectItem'; null if none. ADVISORY — must equal the DERIVED primary (first well-known/select/click/open/view/press-flavored callback, else the only callback); with 2+ unflavored callbacks there is no primary: pass null and key templates by callback name"),
      },
    },
    guarded(async (input) => {
      const problems = validateElementCode(input.code, "component");
      if (input.skeletonCode) problems.push(...validateElementCode(input.skeletonCode, "skeleton"));
      if (problems.length === 0) problems.push(...checkInteractionWiring(input));
      if (problems.length) return fail(`Element rejected by pre-flight validation:\n- ${problems.join("\n- ")}`);

      const version = {
        code: input.code,
        skeletonCode: input.skeletonCode ?? null,
        prompt: "Authored by the customer's agent via the BranderUX MCP.",
        propsSchema: input.propsSchema,
        defaultProps: input.defaultProps,
        toolSchema: { description: input.description, input_schema: input.propsSchema },
        structurePrompt: input.structurePrompt,
        clickQueryTemplate: input.clickQueryTemplate,
        interactionPropName: input.interactionPropName,
        rightClickPropName: detectRightClickProp(input.code),
        clickArgIsObject: true,
        extractionStatus: "succeeded",
      };
      const created = await api.post<Record<string, unknown>>(`/projects/${input.projectId}/elements`, {
        name: input.name,
        description: input.description,
        category: input.category,
        iconName: input.iconName,
        status: "published",
        version,
      });
      return withPreview(ok({ element: created ?? {} }), {
        name: input.name,
        version: 1,
        code: input.code,
        propsSchema: input.propsSchema,
        defaultProps: input.defaultProps,
        clickQueryTemplate: input.clickQueryTemplate,
        panel: await fetchPanelContext(api, input.projectId),
      });
    })
  );

  server.registerTool(
    "publish_element_version",
    {
      title: "Publish element version",
      description:
        "Append a new version to an existing element (same pre-flight validation, code AND action wiring) and promote it to published. The returned publishedVersion is the number to pin in screens.",
      annotations: WRITE,
      outputSchema: {
        elementId: z.string(),
        publishedVersion: z.number().optional(),
        preview: z.object({}).passthrough().optional(),
      },
      _meta: {
        ui: { resourceUri: PREVIEW_RESOURCE_URI },
        "ui/resourceUri": PREVIEW_RESOURCE_URI,
      },
      inputSchema: {
      projectId: z.string().uuid(),
      elementId: z.string().uuid(),
      code: z.string().min(1),
      skeletonCode: z.string().optional(),
      propsSchema: z.object({}).passthrough(),
      defaultProps: z.object({}).passthrough(),
      structurePrompt: z.string().min(1),
      clickQueryTemplate: z.string().nullable(),
      interactionPropName: z.string().nullable(),
      },
    },
    guarded(async (input) => {
      const problems = validateElementCode(input.code, "component");
      if (input.skeletonCode) problems.push(...validateElementCode(input.skeletonCode, "skeleton"));
      if (problems.length === 0) problems.push(...checkInteractionWiring(input));
      if (problems.length) return fail(`Version rejected by pre-flight validation:\n- ${problems.join("\n- ")}`);

      const element = await api.get<{ description?: string; name?: string }>(
        `/projects/${input.projectId}/elements/${input.elementId}`
      );
      if (!element) return fail(`Element ${input.elementId} not found.`);

      const appended = await api.post<{ version: number }>(
        `/projects/${input.projectId}/elements/${input.elementId}/versions`,
        {
          code: input.code,
          skeletonCode: input.skeletonCode ?? null,
          prompt: "Authored by the customer's agent via the BranderUX MCP.",
          propsSchema: input.propsSchema,
          defaultProps: input.defaultProps,
          toolSchema: { description: element.description ?? "", input_schema: input.propsSchema },
          structurePrompt: input.structurePrompt,
          clickQueryTemplate: input.clickQueryTemplate,
          interactionPropName: input.interactionPropName,
          rightClickPropName: detectRightClickProp(input.code),
          clickArgIsObject: true,
          extractionStatus: "succeeded",
        }
      );
      await api.patch(`/projects/${input.projectId}/elements/${input.elementId}`, { status: "published" });
      const result = ok({ elementId: input.elementId, publishedVersion: appended?.version });
      return withPreview(result, {
        name: element.name ?? "Custom element",
        version: appended?.version,
        code: input.code,
        propsSchema: input.propsSchema,
        defaultProps: input.defaultProps,
        clickQueryTemplate: input.clickQueryTemplate,
        panel: await fetchPanelContext(api, input.projectId),
      });
    })
  );

  server.registerTool(
    "edit_element",
    {
      title: "Edit custom element",
      description:
        "Fix an element that already exists with a few search-and-replace edits, applied on the server to the code of its current version. " +
        "It edits the current version whatever the element's status and, exactly like publish_element_version, the result is published (a draft element becomes published). " +
        "Prefer it over publish_element_version whenever the change is a few lines: you send only what changes, and nothing else in the file can break. " +
        "Each search must be copied EXACTLY from the current code (get_element shows it; one consistent indentation difference is tolerated) and include enough surrounding lines to match exactly one place. " +
        "Edits run in order, each on the code the edits before it leave. When any edit matches no place or more than one, the whole call is refused, each failed edit is named with the reason, and nothing is published. " +
        "On success it runs the same pre-flight as publish_element_version on the edited code (the stored skeleton is carried forward as it is, not validated again), publishes the next version with every other field carried forward unchanged (propsSchema, defaultProps, structurePrompt, clickQueryTemplate, interactionPropName, skeleton), " +
        "and re-pins every screen placement pinned to the version it edited (baseVersion in the result) to the new one (repinScreens: false leaves the screens alone). " +
        "A placement pinned to any other version may be pinned on purpose, so it keeps its pin and is listed in otherPins. " +
        "When another client publishes this element while the call runs, the call is refused and nothing is published: read the current code with get_element and call edit_element again. " +
        "A change to propsSchema, defaultProps or the templates goes through publish_element_version.",
      annotations: WRITE,
      outputSchema: {
        elementId: z.string(),
        publishedVersion: z.number().optional(),
        baseVersion: z.number(),
        appliedEdits: z.number(),
        repinnedScreens: z.array(z.string()),
        repinFailures: z.array(z.object({ screenId: z.string(), error: z.string() })).optional(),
        otherPins: z.array(z.object({ screenId: z.string(), version: z.number() })).optional(),
        preview: z.object({}).passthrough().optional(),
      },
      _meta: {
        ui: { resourceUri: PREVIEW_RESOURCE_URI },
        "ui/resourceUri": PREVIEW_RESOURCE_URI,
      },
      inputSchema: {
        projectId: z.string().uuid(),
        elementId: z.string().uuid(),
        edits: z
          .array(
            z.object({
              search: z
                .string()
                .max(20000)
                .describe("Text copied exactly from the current code, with enough surrounding lines to match one place"),
              replace: z.string().max(20000).describe("What the matched text becomes"),
            })
          )
          .min(1)
          .max(20)
          .describe("1 to 20 edits, applied in order"),
        repinScreens: z
          .boolean()
          .default(true)
          .describe(
            "Move every screen placement pinned to the edited version onto the new one (default true). Pins to other versions are never moved."
          ),
      },
    },
    guarded(async (input) => {
      const elementPath = `/projects/${input.projectId}/elements/${input.elementId}`;
      const element = await api.get<StoredElement>(elementPath);
      if (!element) return fail(`Element ${input.elementId} not found.`);
      const current = element.currentVersionPayload;
      if (!current?.code) {
        return fail(`Element ${input.elementId} has no version code to edit. Publish one with publish_element_version.`);
      }
      const baseVersion = currentVersionOf(element);
      if (baseVersion === undefined) {
        return fail(
          `The version number of element ${input.elementId}'s current code could not be read, so the edit cannot be checked against what is live. Nothing was published and no screen was touched. ` +
            "Read the element with get_element and call edit_element again, or publish the full code with publish_element_version."
        );
      }

      const edited = applyEdits(current.code, input.edits);
      if (!edited.ok) return fail(editFailureText(edited.failures, input.edits.length));
      if (edited.code === current.code) {
        return fail("The edits leave the code exactly as it was, so there is nothing to publish. Nothing was changed.");
      }

      // The full pre-flight runs on the edited CODE only. The stored skeleton is carried forward
      // as it is: an edit that does not touch it is never refused for it (a skeleton stored before
      // today's validator rules would otherwise block every unrelated fix).
      const problems = validateElementCode(edited.code, "component");
      if (problems.length === 0) {
        problems.push(
          ...checkInteractionWiring({
            code: edited.code,
            propsSchema: current.propsSchema ?? {},
            clickQueryTemplate: current.clickQueryTemplate ?? null,
            interactionPropName: current.interactionPropName ?? null,
          })
        );
      }
      if (problems.length) {
        return fail(
          `The edited code was rejected by pre-flight validation, so nothing was published and no screen was touched:\n- ${problems.join("\n- ")}\n` +
            "Fix it with other edits and call edit_element again. A fix that needs a different propsSchema, clickQueryTemplate or interactionPropName goes through publish_element_version."
        );
      }

      // Never build on a stale version: another client may have published since the code above was
      // read, and the next version would silently drop its change. Read the version number again
      // right before the publish. The remaining window is the publish request itself: Spring's
      // version append takes no expected version to check against.
      const latest = await api.get<StoredElement>(elementPath);
      if (!latest) return fail(`Element ${input.elementId} not found.`);
      const latestVersion = currentVersionOf(latest);
      if (latestVersion !== baseVersion) return fail(staleVersionText(input.elementId, baseVersion, latestVersion));

      const appended = await api.post<{ version?: number }>(
        `${elementPath}/versions`,
        nextVersionBody(current, edited.code, element.description, edited.applied)
      );
      await api.patch(elementPath, { status: "published" });

      // The version is published from here on: nothing below may turn the call into an error.
      let publishedVersion = typeof appended?.version === "number" ? appended.version : undefined;
      if (publishedVersion === undefined) {
        try {
          const fresh = await api.get<{ currentVersion?: number }>(elementPath);
          if (typeof fresh?.currentVersion === "number") publishedVersion = fresh.currentVersion;
        } catch {
          /* reported below as a re-pin that could not run */
        }
      }

      let repin: RepinOutcome = { repinnedScreens: [], repinFailures: [], otherPins: [] };
      if (input.repinScreens !== false) {
        if (publishedVersion !== undefined && element.elementKey) {
          repin = await repinProjectScreens(api, input.projectId, element.elementKey, baseVersion, publishedVersion);
        } else {
          repin.repinFailures.push({
            screenId: "*",
            error:
              "The new version number did not come back, so no screen was re-pinned. Read it with list_element_versions and pin it with put_screen.",
          });
        }
      }

      const result = ok({
        elementId: input.elementId,
        ...(publishedVersion !== undefined ? { publishedVersion } : {}),
        baseVersion,
        appliedEdits: edited.applied,
        repinnedScreens: repin.repinnedScreens,
        ...(repin.repinFailures.length > 0 ? { repinFailures: repin.repinFailures } : {}),
        ...(repin.otherPins.length > 0 ? { otherPins: repin.otherPins } : {}),
      });
      return withPreview(result, {
        name: element.name ?? element.elementKey ?? "Custom element",
        version: publishedVersion,
        code: edited.code,
        propsSchema: current.propsSchema,
        defaultProps: current.defaultProps ?? undefined,
        clickQueryTemplate: current.clickQueryTemplate,
        panel: await fetchPanelContext(api, input.projectId),
      });
    })
  );

  server.registerTool(
    "delete_element",
    {
      title: "Delete custom element",
      description: `Delete a custom element (existing screen placements will stop rendering it). ${CONFIRM_HINT}`,
      inputSchema: { projectId: z.string().uuid(), elementId: z.string().uuid(), confirm: z.boolean().default(false) },
      outputSchema: { deleted: z.string() },
      annotations: DESTRUCTIVE,
    },
    guarded(async ({ projectId, elementId, confirm }) => {
      if (!confirm) return fail(CONFIRM_HINT);
      await api.delete(`/projects/${projectId}/elements/${elementId}`);
      return ok({ deleted: elementId });
    })
  );
}
