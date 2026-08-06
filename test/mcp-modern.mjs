import { rpc, callTool } from "./mcp-e2e.mjs";
const pass = [], fail = [];
const check = (n, c, d = "") => (c ? pass : fail).push(`${n}${d ? " — " + d : ""}`);

const init = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "modern", version: "1" } });
check("initialize", !!init.protocolVersion, `protocol ${init.protocolVersion}`);
check("server instructions present", (init.instructions || "").includes("BranderUX"), `${(init.instructions||"").length} chars`);
check("capabilities: tools+resources+prompts",
  !!init.capabilities?.tools && !!init.capabilities?.resources && !!init.capabilities?.prompts,
  Object.keys(init.capabilities || {}).join(","));

const { tools } = await rpc("tools/list", {});
check("tool count", tools.length >= 24, `${tools.length} tools`);
const titled = tools.filter((t) => t.title || t.annotations?.title);
check("tools have titles", titled.length === tools.length, `${titled.length}/${tools.length}`);
const withOutput = tools.filter((t) => t.outputSchema);
check("tools have outputSchema", withOutput.length === tools.length, `${withOutput.length}/${tools.length}`);
const destructive = tools.filter((t) => t.annotations?.destructiveHint === true).map((t) => t.name).sort();
check("destructive tools annotated", destructive.length === 4, destructive.join(", "));
const readOnly = tools.filter((t) => t.annotations?.readOnlyHint === true).map((t) => t.name);
check("read-only tools annotated", readOnly.length >= 10, `${readOnly.length} read-only`);

const { resources } = await rpc("resources/list", {});
check("resources exposed", resources.length >= 7, `${resources.length} docs as resources`);
const read = await rpc("resources/read", { uri: "brander://docs/agent-frameworks" });
check("resource read", read.contents?.[0]?.text?.includes("customer-facing agent"), "agent-frameworks");

const { prompts } = await rpc("prompts/list", {});
check("prompts exposed", prompts.length === 3, prompts.map((p) => p.name).join(", "));
const got = await rpc("prompts/get", { name: "integrate-branderux", arguments: { stack: "Next.js + LangGraph" } });
check("prompt renders", got.messages?.[0]?.content?.text?.includes("LangGraph"), "args interpolated");

// structuredContent on a real call
const who = await rpc("tools/call", { name: "whoami", arguments: {} });
check("structuredContent returned", !!who.structuredContent?.user, "whoami");
check("token exchange used for API call", who.structuredContent?.user?.email === "lev@branderux.com", who.structuredContent?.user?.email);

// knowledge: framework coverage
const snip = await callTool("get_integration_snippet", { target: "agent-framework" });
check("agent-framework snippet", snip.text.includes("req.body.params") && snip.text.includes("RUN_FINISHED"));
const doc = await callTool("read_doc", { doc: "agent-frameworks" });
for (const fw of ["LangGraph", "CrewAI", "Mastra", "Pydantic AI", "Google ADK", "LlamaIndex", "Vercel AI SDK"]) {
  check(`docs cover ${fw}`, doc.text.includes(fw));
}
const mcpApps = await callTool("get_integration_snippet", { target: "mcp-apps" });
check("mcp-apps snippet distinguishes products", mcpApps.text.includes("@brander/mcp-tools"));

console.log(`PASS (${pass.length}):`); pass.forEach((p) => console.log("  ✓", p));
if (fail.length) { console.log(`\nFAIL (${fail.length}):`); fail.forEach((f) => console.log("  ✗", f)); process.exit(1); }
console.log("\nALL MODERN-SURFACE CHECKS PASSED");
