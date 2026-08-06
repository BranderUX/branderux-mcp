import { z } from "zod";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { READ_ONLY, fail, ok } from "./helpers.js";
import { SNIPPETS, type SnippetKey } from "./snippets.js";

const DOCS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "docs");

export function loadDocs(): Map<string, string> {
  const docs = new Map<string, string>();
  for (const file of readdirSync(DOCS_DIR)) {
    if (file.endsWith(".md")) {
      docs.set(file.replace(/\.md$/, ""), readFileSync(join(DOCS_DIR, file), "utf8"));
    }
  }
  return docs;
}

export function registerKnowledgeTools(server: McpServer): void {
  const docs = loadDocs();
  const docNames = [...docs.keys()].sort() as [string, ...string[]];

  server.registerTool(
    "get_started",
    {
      title: "Get started with BranderUX",
      description:
        "START HERE: what BranderUX is, the two integration paths, and how to use these tools to build a full agentic app.",
      inputSchema: {},
      outputSchema: { guide: z.string(), availableDocs: z.array(z.string()) },
      annotations: READ_ONLY,
    },
    async () =>
      ok({
        guide: docs.get("getting-started") ?? "Docs corpus missing.",
        availableDocs: docNames,
      })
  );

  server.registerTool(
    "read_doc",
    {
      title: "Read a reference doc",
      description: `Read one BranderUX reference doc in full. Available: ${docNames.join(", ")}`,
      inputSchema: { doc: z.enum(docNames) },
      outputSchema: { doc: z.string(), content: z.string() },
      annotations: READ_ONLY,
    },
    async ({ doc }) => {
      const content = docs.get(doc);
      return content ? ok({ doc, content }) : fail(`Unknown doc '${doc}'.`);
    }
  );

  server.registerTool(
    "search_docs",
    {
      title: "Search the docs",
      description: "Case-insensitive search across the reference docs; returns matching lines with doc names.",
      inputSchema: { query: z.string().min(2) },
      outputSchema: { matches: z.array(z.object({ doc: z.string(), line: z.string() })) },
      annotations: READ_ONLY,
    },
    async ({ query }) => {
      const needle = query.toLowerCase();
      const matches: { doc: string; line: string }[] = [];
      for (const [name, content] of docs) {
        for (const line of content.split("\n")) {
          if (line.toLowerCase().includes(needle)) matches.push({ doc: name, line: line.trim() });
          if (matches.length >= 40) break;
        }
      }
      return ok({ matches });
    }
  );

  const snippetKeys = Object.keys(SNIPPETS).sort() as [SnippetKey, ...SnippetKey[]];
  server.registerTool(
    "get_integration_snippet",
    {
      title: "Get an integration snippet",
      description:
        "Verified integration snippet for connecting a customer-facing agent to BranderUX. Covers direct provider SDKs, a framework-agnostic backend, and the AG-UI agent frameworks. These shapes are correct: params.system is forwarded, params.tools is optional-chained, and sseStream bodies are read from `params`.",
      inputSchema: { target: z.enum(snippetKeys) },
      outputSchema: { target: z.string(), snippet: z.string() },
      annotations: READ_ONLY,
    },
    async ({ target }) => ok({ target, snippet: SNIPPETS[target] })
  );
}

/**
 * Docs are ALSO exposed as MCP resources: tools are for the model to call, resources
 * are what a user can attach in a client UI. Same corpus, two idiomatic surfaces.
 */
export function registerKnowledgeResources(server: McpServer): void {
  const docs = loadDocs();
  for (const [name, content] of docs) {
    server.registerResource(
      name,
      `brander://docs/${name}`,
      {
        title: name.replace(/-/g, " "),
        description: content.split("\n").find((l) => l.startsWith("# "))?.slice(2) ?? name,
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: content }],
      })
    );
  }
}
