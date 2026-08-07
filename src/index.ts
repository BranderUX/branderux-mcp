import { createServer as createHttpServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./create-server.js";
import { challengeHeader, exchangeForApiToken, protectedResourceMetadata, verifyAudience } from "./auth.js";
import { CONFIG } from "./config.js";

/**
 * Local dev server: same behavior as the Vercel deployment, on http://localhost:3010.
 * Routes: POST /mcp and GET /.well-known/oauth-protected-resource.
 */
const PORT = Number(process.env.PORT || 3010);

const httpServer = createHttpServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // RFC 9728 §3: serve both the root form and the path-inserted form
  // (/.well-known/oauth-protected-resource/mcp) — strict clients try the latter first.
  if (
    url.pathname === "/.well-known/oauth-protected-resource" ||
    url.pathname === "/.well-known/oauth-protected-resource/mcp"
  ) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(protectedResourceMetadata()));
    return;
  }

  if (url.pathname !== "/mcp") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed in stateless mode" }));
    return;
  }

  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith("Bearer ")) {
    res.writeHead(401, {
      "Content-Type": "application/json",
      "WWW-Authenticate": challengeHeader(),
    });
    res.end(
      JSON.stringify({
        error: "unauthorized",
        error_description: "Sign in with your BranderUX account to use this server.",
      })
    );
    return;
  }

  const token = authorization.slice(7);
  const audience = verifyAudience(token);
  if (!audience.ok) {
    res.writeHead(401, {
      "Content-Type": "application/json",
      "WWW-Authenticate": challengeHeader(undefined, "invalid_token"),
    });
    res.end(
      JSON.stringify({
        error: "invalid_token",
        error_description:
          audience.reason === "wrong_audience"
            ? "This token was not issued for this MCP server. Re-authorize with the resource parameter set to this server."
            : `Token ${audience.reason}.`,
      })
    );
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;

  const server = await createServer(() => exchangeForApiToken(token));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
});

httpServer.listen(PORT, () => {
  console.error(`BranderUX MCP listening on http://localhost:${PORT}/mcp (API: ${CONFIG.apiBase})`);
});
