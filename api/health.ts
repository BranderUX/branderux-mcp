import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { VercelRequest, VercelResponse } from "@vercel/node";
// Side-effect-free import, load-bearing for the bundler: the file-tracer only
// walks @brander/mcp-tools' module graph (whose readFileSync is what bundles
// the panel HTML) when the package is actually imported — resolve() alone
// doesn't. This makes this function's bundle match api/mcp.ts's.
import "@brander/mcp-tools";
import { isPreviewAppAvailable } from "../src/preview/app-resource.js";
import { AUTH_ISSUER, MCP_RESOURCE } from "../src/config.js";

/**
 * True when @brander/mcp-tools' universal-renderer HTML shipped in the bundle.
 * Resolving the package ENTRY (ESM — its exports map has no CJS condition)
 * keeps the file-tracer walking the library's own readFileSync — which is what
 * bundles the HTML — and gives a runtime anchor to derive its path from
 * (dist/server/lib-entry.js → ../../app/index.html = dist/app/index.html).
 */
function isPlaygroundAppBundled(): boolean {
  try {
    const entry = fileURLToPath(import.meta.resolve("@brander/mcp-tools"));
    return existsSync(join(entry, "..", "..", "app", "index.html"));
  } catch {
    return false;
  }
}

/**
 * Public deployment self-check. The *Bundled fields are load-bearing: false
 * means that app's HTML did not ship in the function bundle, and its tools
 * silently degrade to data-only results.
 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    ok: true,
    resource: MCP_RESOURCE,
    authorizationServer: AUTH_ISSUER,
    previewAppBundled: isPreviewAppAvailable(),
    playgroundAppBundled: isPlaygroundAppBundled(),
  });
}
