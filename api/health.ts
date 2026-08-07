import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isPreviewAppAvailable } from "../src/preview/app-resource.js";
import { AUTH_ISSUER, MCP_RESOURCE } from "../src/config.js";

const require = createRequire(import.meta.url);

/** True when @brander/mcp-tools' universal-renderer HTML shipped in the bundle. */
function isPlaygroundAppBundled(): boolean {
  try {
    const pkg = require.resolve("@brander/mcp-tools/package.json");
    return existsSync(join(pkg, "..", "dist", "app", "index.html"));
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
