import { rpc, callTool } from "./mcp-e2e.mjs";
const pass = [], fail = [];
const check = (name, cond, detail = "") => (cond ? pass : fail).push(`${name}${detail ? " — " + detail : ""}`);

await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
const tools = await rpc("tools/list", {});
const names = tools.tools.map((t) => t.name).sort();
console.log(`TOOLS (${names.length}):`, names.join(", "));
check("tools/list", names.length >= 18, `${names.length} tools`);

// --- knowledge (no API)
let r = await callTool("get_started");
check("get_started", r.text.includes("BranderUX is AI-UX infrastructure"));
r = await callTool("read_doc", { doc: "custom-elements-contract" });
check("read_doc", r.text.includes("export default function Component"));
r = await callTool("search_docs", { query: "params.system" });
check("search_docs", r.text.includes("["));
r = await callTool("get_integration_snippet", { target: "sse-backend" });
check("get_integration_snippet", r.text.includes("req.body") && r.text.includes("system"));

// --- control
r = await callTool("whoami");
check("whoami", r.text.includes("lev@branderux.com"));

r = await callTool("create_project", { name: "MCP E2E Test Store", description: "created by the MCP e2e suite" });
const project = JSON.parse(r.text).project;
check("create_project", !!project.id, project.id);
const projectId = project.id;

r = await callTool("update_brand_settings", { projectId, brandSettings: { brandName: "MCP E2E", primaryColor: "#C06B4A" } });
check("update_brand_settings", JSON.parse(r.text).project?.brandSettings?.primaryColor === "#C06B4A");

r = await callTool("update_project_settings", { projectId, settings: { uiGenerationMode: "flexible" } });
check("update_project_settings", JSON.parse(r.text).project?.settings?.uiGenerationMode === "flexible");

// element: bad code must be REJECTED by pre-flight
r = await callTool("create_element", {
  projectId, name: "Bad Element", description: "should fail", category: "data", iconName: "Box",
  code: `import axios from "axios";\nexport default function Widget() { return null; }`,
  propsSchema: { type: "object" }, defaultProps: {}, structurePrompt: "x", clickQueryTemplate: null, interactionPropName: null,
});
check("create_element rejects bad code", r.isError && r.text.includes("allowlist") && r.text.includes("Component"), "pre-flight");

const goodCode = `import { Box, Typography } from "@mui/material";

export interface Props {
  items: { id: string; name: string; price: number }[];
  onSelectItem?: (item: { id: string; name: string }) => void;
  onItemContextMenu?: (event: React.MouseEvent, item: unknown) => void;
}

export default function Component({ items, onSelectItem, onItemContextMenu }: Props) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 2, p: 1 }}>
      {items.map((item) => (
        <Box
          key={item.id}
          onClick={() => onSelectItem?.(item)}
          onContextMenu={(e) => { e.preventDefault(); onItemContextMenu?.(e, item); }}
          sx={{ p: 2, borderRadius: "8px", bgcolor: "#fff", cursor: "pointer" }}
        >
          <Typography>{item.name}</Typography>
          <Typography sx={{ color: "#888" }}>\${item.price}</Typography>
        </Box>
      ))}
    </Box>
  );
}`;
const skeleton = `import { Box, Skeleton } from "@mui/material";

export default function SkeletonComponent() {
  return <Box sx={{ display: "grid", gap: 2 }}>{[0,1,2].map((i) => <Skeleton key={i} height={90} />)}</Box>;
}`;
r = await callTool("create_element", {
  projectId, name: "E2E Product Grid", description: "Grid of products with click-through", category: "data", iconName: "LayoutGrid",
  code: goodCode, skeletonCode: skeleton,
  propsSchema: { type: "object", properties: { items: { type: "array" } }, required: ["items"] },
  defaultProps: { items: [{ id: "1", name: "Demo", price: 10 }] },
  structurePrompt: "Use to list products.",
  clickQueryTemplate: "Show details for {name} (ID: {id})",
  interactionPropName: "onSelectItem",
});
const element = r.isError ? null : JSON.parse(r.text).element;
check("create_element publishes", !!element?.id, element?.elementKey);

r = await callTool("list_elements", { projectId });
const listed = JSON.parse(r.text).elements;
check("list_elements", listed.length === 1 && listed[0].status === "published", `v${listed[0]?.currentVersion}`);

// preview: structuredContent.preview + _meta.ui.resourceUri (MCP Apps)
const previewRaw = await rpc("tools/call", { name: "preview_element", arguments: { projectId, elementId: element.id } });
const preview = previewRaw.structuredContent?.preview;
check("preview_element payload", !!preview?.compiledCode && Array.isArray(preview?.callbackNames), `callbacks: ${preview?.callbackNames?.join(",")}`);
check("preview_element app meta", previewRaw._meta?.ui?.resourceUri === "ui://branderux/element-preview", previewRaw._meta?.ui?.resourceUri);
check("preview shims include context menu", preview?.callbackNames?.includes("onItemContextMenu"));

r = await callTool("publish_element_version", {
  projectId, elementId: element.id, code: goodCode.replace("gap: 2", "gap: 3"), skeletonCode: skeleton,
  propsSchema: { type: "object", properties: { items: { type: "array" } }, required: ["items"] },
  defaultProps: { items: [{ id: "1", name: "Demo", price: 10 }] },
  structurePrompt: "Use to list products.", clickQueryTemplate: "Show details for {name} (ID: {id})", interactionPropName: "onSelectItem",
});
check("publish_element_version", JSON.parse(r.text).publishedVersion === 2, `v${JSON.parse(r.text).publishedVersion}`);

// screens
r = await callTool("put_screen", {
  projectId,
  screen: {
    id: "e2e-home", name: "E2E Home", description: "Home screen from the e2e suite",
    config: { whenToUse: "The user opens the app.", exampleQueries: ["Show home page"], clickedElements: ["product → detail"] },
    elements: [{
      id: "grid", elementType: null, customElementId: listed[0].elementKey, version: 2,
      position: { row: 0, column: 0, subRow: 0 },
      size: { width: { md: "100.00%", xs: "100%" }, height: "auto", flex: { md: "1 1 100.00%", xs: "1 1 100%" }, minWidth: null, maxWidth: null, alignSelf: null },
      description: "Product grid",
    }],
  },
});
check("put_screen create", JSON.parse(r.text).saved === "e2e-home");

r = await callTool("put_screen", {
  projectId,
  screen: { id: "e2e-home", name: "E2E Home v2", config: { whenToUse: "updated" }, elements: [] },
});
check("put_screen update (version bump)", JSON.parse(r.text).version === 2);

r = await callTool("list_screens", { projectId });
check("list_screens", JSON.parse(r.text).screens.length === 1);
r = await callTool("get_screen", { projectId, screenId: "e2e-home" });
check("get_screen", JSON.parse(r.text).screen.name === "E2E Home v2");

// keys
r = await callTool("create_api_key", { projectId, label: "e2e", allowedOrigins: ["https://e2e.example.com"] });
const key = JSON.parse(r.text);
check("create_api_key", key.rawKey?.startsWith("bux_pk_"), key.keyPrefix);
r = await callTool("list_api_keys", { projectId });
check("list_api_keys", JSON.parse(r.text).keys.length === 1);
r = await callTool("set_key_origins", { projectId, keyId: key.id, allowedOrigins: ["https://a.example.com", "https://b.example.com"] });
check("set_key_origins", JSON.parse(r.text).key?.allowedOrigins?.length === 2);

// confirm gates
r = await callTool("revoke_api_key", { projectId, keyId: key.id });
check("revoke gate blocks without confirm", r.isError && r.text.includes("DESTRUCTIVE"));
r = await callTool("revoke_api_key", { projectId, keyId: key.id, confirm: true });
check("revoke with confirm", !r.isError);

r = await callTool("delete_screen", { projectId, screenId: "e2e-home" });
check("delete_screen gate", r.isError);
r = await callTool("delete_screen", { projectId, screenId: "e2e-home", confirm: true });
check("delete_screen with confirm", !r.isError && JSON.parse(r.text).totalScreens === 0);

r = await callTool("delete_element", { projectId, elementId: element.id, confirm: true });
check("delete_element with confirm", !r.isError);

r = await callTool("get_project", { projectId: "00000000-0000-0000-0000-000000000000" });
check("204→not-found mapping", r.isError && r.text.toLowerCase().includes("not found"));

r = await callTool("delete_project", { projectId });
check("delete_project gate", r.isError);
r = await callTool("delete_project", { projectId, confirm: true });
check("delete_project cleanup", !r.isError);

console.log(`\nPASS (${pass.length}):`); pass.forEach((p) => console.log("  ✓", p));
if (fail.length) { console.log(`\nFAIL (${fail.length}):`); fail.forEach((f) => console.log("  ✗", f)); process.exit(1); }
console.log("\nALL MCP TOOL TESTS PASSED");
