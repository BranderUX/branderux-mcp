import type { VercelRequest, VercelResponse } from "@vercel/node";
import { protectedResourceMetadata } from "../src/auth.js";

/** RFC 9728 protected-resource metadata — tells MCP clients where to sign in. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json(protectedResourceMetadata());
}
