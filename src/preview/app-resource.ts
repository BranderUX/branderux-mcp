import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

/**
 * The element-preview MCP App resource. Hosts that support the apps extension
 * render tool results carrying `_meta.ui.resourceUri` in a sandboxed iframe;
 * hosts that don't simply show the tool's text content — nothing breaks.
 */

export const PREVIEW_RESOURCE_URI = "ui://branderux/element-preview";

/** Common storage/CDN origins; per-response CSP adds the element's own image origins. */
const BASE_MEDIA_DOMAINS = [
  "https://images.unsplash.com",
  "https://res.cloudinary.com",
  "https://storage.googleapis.com",
  "https://lh3.googleusercontent.com",
  "https://i.imgur.com",
];

/**
 * Candidate locations for the built app. Local/compiled runs resolve relative to
 * this module (dist/preview/ → dist/app/); on Vercel the function is bundled to
 * /var/task with cwd-relative includeFiles (see vercel.json), so cwd is tried too.
 */
const APP_HTML_CANDIDATES = [
  join(dirname(fileURLToPath(import.meta.url)), "..", "app", "index.html"),
  join(process.cwd(), "dist", "app", "index.html"),
];

let cachedHtml: string | null = null;

function loadAppHtml(): string | null {
  if (cachedHtml) return cachedHtml;
  for (const candidate of APP_HTML_CANDIDATES) {
    if (existsSync(candidate)) {
      cachedHtml = readFileSync(candidate, "utf8");
      return cachedHtml;
    }
  }
  return null;
}

export function isPreviewAppAvailable(): boolean {
  return loadAppHtml() !== null;
}

/** No-op (with a warning) when dist/app is missing, so tools still work text-only. */
export function registerPreviewAppResource(server: McpServer): void {
  if (!isPreviewAppAvailable()) {
    console.error(
      `Element-preview app not found (tried ${APP_HTML_CANDIDATES.join(", ")}) — run \`npm run build:app\`.`
    );
    return;
  }
  registerAppResource(
    server,
    "BranderUX Element Preview",
    PREVIEW_RESOURCE_URI,
    { description: "Live sandboxed preview of a custom element with its demo props" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: RESOURCE_MIME_TYPE,
          text: loadAppHtml()!,
          _meta: {
            ui: {
              prefersBorder: true,
              csp: { resourceDomains: [...BASE_MEDIA_DOMAINS] },
            },
          },
        },
      ],
    })
  );
}

/**
 * `_meta` for a tool result that should render in the preview app. Extra image
 * origins (from the element's demo props) extend the resource's static CSP.
 */
export function previewMeta(extraImageOrigins: string[] = []): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    ui: { resourceUri: PREVIEW_RESOURCE_URI },
    "ui/resourceUri": PREVIEW_RESOURCE_URI,
  };
  if (extraImageOrigins.length > 0) {
    const resourceDomains = [...BASE_MEDIA_DOMAINS];
    for (const origin of extraImageOrigins) {
      if (!resourceDomains.includes(origin)) resourceDomains.push(origin);
    }
    (meta.ui as Record<string, unknown>).csp = { resourceDomains };
  }
  return meta;
}
