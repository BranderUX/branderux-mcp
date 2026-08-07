import type { VercelRequest, VercelResponse } from "@vercel/node";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "../src/create-server.js";
import { challengeHeader, exchangeForApiToken, verifyAudience } from "../src/auth.js";

/**
 * Stateless Streamable-HTTP MCP endpoint, OAuth-protected per the MCP authorization
 * spec: a request without a usable bearer gets 401 + WWW-Authenticate pointing at the
 * protected-resource metadata (which triggers the client's browser sign-in), and the
 * token's audience is validated before it is used for anything.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed in stateless mode" });
    return;
  }

  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith("Bearer ")) {
    res
      .status(401)
      .setHeader("WWW-Authenticate", challengeHeader())
      .json({
        error: "unauthorized",
        error_description: "Sign in with your BranderUX account to use this server.",
      });
    return;
  }

  const token = authorization.slice(7);
  const audience = verifyAudience(token);
  if (!audience.ok) {
    res
      .status(401)
      .setHeader("WWW-Authenticate", challengeHeader(undefined, "invalid_token"))
      .json({
        error: "invalid_token",
        error_description:
          audience.reason === "wrong_audience"
            ? "This token was not issued for this MCP server. Re-authorize with the resource parameter set to this server."
            : `Token ${audience.reason}.`,
      });
    return;
  }

  const server = await createServer(() => exchangeForApiToken(token));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
