/**
 * Acceptance: reproduce a mini Atelier-Nova-style project using ONLY MCP tools,
 * then verify the result is real by reading it back through the public embed
 * endpoints the SDK itself uses (brand-settings + custom-elements/public).
 */
import { rpc, callTool } from "./mcp-e2e.mjs";
const steps = [];
const log = (s) => { steps.push(s); console.log("  •", s); };

await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "acceptance", version: "1" } });

// 1. orientation, exactly as a fresh agent would
const started = await callTool("get_started");
if (!started.text.includes("create_project")) throw new Error("get_started missing guidance");
log("read get_started");

// 2. project + brand + flexible mode
const project = JSON.parse((await callTool("create_project", { name: "Acceptance Mini Store" })).text).project;
log(`created project ${project.id}`);
await callTool("update_brand_settings", { projectId: project.id, brandSettings: { brandName: "Mini Store", primaryColor: "#2E241D", secondaryColor: "#C06B4A", backgroundColor: "#F1E8DC", fontFamily: "Georgia, serif" } });
await callTool("update_project_settings", { projectId: project.id, settings: { uiGenerationMode: "flexible" } });
log("branded + set flexible mode");

// 3. two elements written by "the agent"
const grid = `import { Box, Typography } from "@mui/material";

export interface Props {
  products: { id: string; name: string; price: number; imageUrl: string }[];
  onSelectProduct?: (product: { id: string; name: string }) => void;
  onItemContextMenu?: (event: React.MouseEvent, product: unknown) => void;
}

export default function Component({ products, onSelectProduct, onItemContextMenu }: Props) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 2, p: 1 }}>
      {products.map((product) => (
        <Box key={product.id} onClick={() => onSelectProduct?.(product)}
          onContextMenu={(e) => { e.preventDefault(); onItemContextMenu?.(e, product); }}
          sx={{ borderRadius: "8px", overflow: "hidden", bgcolor: "#fff", cursor: "pointer" }}>
          <Box sx={{ width: "100%", aspectRatio: "3 / 4", backgroundImage: \`url(\${product.imageUrl})\`, backgroundSize: "cover" }} />
          <Box sx={{ p: 1.5 }}>
            <Typography sx={{ fontSize: 13 }}>{product.name}</Typography>
            <Typography sx={{ fontSize: 14, color: "#8A7B6E" }}>\${product.price}</Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}`;
const panel = `import { useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";

export interface Props {
  product: { id: string; name: string; price: number };
  sizes: string[];
  preselectedSize: string;
  onPlaceOrder?: (order: { id: string; name: string; size: string }) => void;
}

export default function Component({ product, sizes, preselectedSize, onPlaceOrder }: Props) {
  const [size, setSize] = useState(preselectedSize);
  useEffect(() => setSize(preselectedSize), [preselectedSize]);
  return (
    <Box sx={{ p: 2, bgcolor: "#fff", borderRadius: "8px", maxWidth: 420 }}>
      <Typography sx={{ fontSize: 20 }}>{product.name}</Typography>
      <Typography sx={{ color: "#8A7B6E" }}>\${product.price}</Typography>
      <Box sx={{ mt: 1.5, display: "flex", gap: 0.75 }}>
        {sizes.map((option) => (
          <Box key={option} onClick={() => setSize(option)}
            sx={{ px: 1.25, py: 0.5, borderRadius: "4px", cursor: "pointer",
                  bgcolor: option === size ? "#C06B4A" : "#F4EDE3", color: option === size ? "#fff" : "#3B2E25" }}>
            {option}
          </Box>
        ))}
      </Box>
      <Button fullWidth onClick={() => onPlaceOrder?.({ id: product.id, name: product.name, size })}
        sx={{ mt: 2, bgcolor: "#C06B4A", color: "#fff", textTransform: "none" }}>Place order</Button>
    </Box>
  );
}`;
const gridEl = JSON.parse((await callTool("create_element", {
  projectId: project.id, name: "Mini Product Grid", description: "Product grid with click-through", category: "data", iconName: "LayoutGrid",
  code: grid, propsSchema: { type: "object", properties: { products: { type: "array" } }, required: ["products"] },
  defaultProps: { products: [{ id: "p1", name: "Demo", price: 20, imageUrl: "https://example.com/p.jpg" }] },
  structurePrompt: "Use to list products.", clickQueryTemplate: "Show details for {name} (ID: {id})", interactionPropName: "onSelectProduct",
})).text).element;
const panelEl = JSON.parse((await callTool("create_element", {
  projectId: project.id, name: "Mini Order Panel", description: "Order panel with size picker", category: "interactive", iconName: "ShoppingBag",
  code: panel, propsSchema: { type: "object", properties: { product: { type: "object" }, sizes: { type: "array" }, preselectedSize: { type: "string" } }, required: ["product", "sizes", "preselectedSize"] },
  defaultProps: { product: { id: "p1", name: "Demo", price: 20 }, sizes: ["S", "M", "L"], preselectedSize: "M" },
  structurePrompt: "Use when the shopper opens a product.", clickQueryTemplate: "Place my order: {name}, size {size}", interactionPropName: "onPlaceOrder",
})).text).element;
log(`published elements: ${gridEl.elementKey}, ${panelEl.elementKey}`);

// 4. screens pinning published versions
const elements = JSON.parse((await callTool("list_elements", { projectId: project.id })).text).elements;
const version = (key) => elements.find((e) => e.elementKey === key).currentVersion;
const size = (pct) => ({ width: { md: `${pct}%`, xs: "100%" }, height: "auto", flex: { md: `1 1 ${pct}%`, xs: "1 1 100%" }, minWidth: null, maxWidth: null, alignSelf: null });
await callTool("put_screen", { projectId: project.id, screen: {
  id: "mini-home", name: "Home", description: "Product listing",
  config: { whenToUse: "The shopper opens the store or browses products.", exampleQueries: ["Show home page", "What's new?"], clickedElements: ["product card → order panel"] },
  elements: [{ id: "home-grid", elementType: null, customElementId: gridEl.elementKey, version: version(gridEl.elementKey), position: { row: 0, column: 0, subRow: 0 }, size: size("100.00"), description: "Product grid" }],
}});
await callTool("put_screen", { projectId: project.id, screen: {
  id: "mini-order", name: "Order", description: "Single product order",
  config: { whenToUse: "The shopper opens a specific product or wants to buy.", exampleQueries: ["Show details for the linen dress"], clickedElements: ["Place order → confirmation"] },
  elements: [{ id: "order-panel", elementType: null, customElementId: panelEl.elementKey, version: version(panelEl.elementKey), position: { row: 0, column: 0, subRow: 0 }, size: { ...size("100.00"), maxWidth: { md: "460px", xs: "100%" }, alignSelf: "center" }, description: "Order panel" }],
}});
log("composed 2 screens with pinned element versions");

// 5. embed key
const key = JSON.parse((await callTool("create_api_key", { projectId: project.id, label: "acceptance", allowedOrigins: ["https://acceptance.example.com"] })).text);
log(`minted embed key ${key.keyPrefix}`);

// 6. VERIFY through the PUBLIC embed endpoints (what <Brander /> actually calls)
const API = process.env.BRANDER_API_BASE || "http://localhost:8080/api/v1";
const brand = await fetch(`${API}/projects/brand-settings?projectId=${project.id}`, { headers: { Authorization: `Bearer ${key.rawKey}` } });
const brandBody = await brand.json();
const resolvedBrand = brandBody.brandSettings ?? brandBody;
if (brand.status !== 200 || resolvedBrand.brandName !== "Mini Store") throw new Error(`brand-settings failed: ${brand.status} ${JSON.stringify(brandBody).slice(0,200)}`);
log(`embed brand-settings OK → "${resolvedBrand.brandName}" / ${resolvedBrand.primaryColor}`);

const pins = `${gridEl.elementKey}:${version(gridEl.elementKey)},${panelEl.elementKey}:${version(panelEl.elementKey)}`;
const els = await fetch(`${API}/projects/custom-elements/public?projectId=${project.id}&versions=${encodeURIComponent(pins)}`, { headers: { Authorization: `Bearer ${key.rawKey}` } });
const elsBody = await els.json();
if (els.status !== 200 || elsBody.length !== 2) throw new Error(`custom-elements failed: ${els.status} ${JSON.stringify(elsBody).slice(0,200)}`);
if (!elsBody[0].currentVersionPayload?.code && !elsBody[0].version?.code) throw new Error("element payload missing code");
log(`embed custom-elements OK → ${elsBody.length} published elements with code`);

// cleanup
await callTool("delete_project", { projectId: project.id, confirm: true });
log("cleaned up");

console.log(`\nACCEPTANCE PASSED — ${steps.length} steps, project built and served through the real embed API`);
