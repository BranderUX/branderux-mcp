import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isPreviewAppAvailable } from "../src/preview/app-resource.js";
import { AUTH_ISSUER, MCP_RESOURCE } from "../src/config.js";

/**
 * Public deployment self-check. `previewAppBundled` is the load-bearing field:
 * false means the element-preview MCP App HTML did not ship in the function
 * bundle and preview tools silently degrade to data-only results.
 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    ok: true,
    resource: MCP_RESOURCE,
    authorizationServer: AUTH_ISSUER,
    previewAppBundled: isPreviewAppAvailable(),
  });
}
