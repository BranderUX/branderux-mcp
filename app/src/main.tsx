import * as React from "react";
import { createRoot } from "react-dom/client";
import { App as McpApp } from "@modelcontextprotocol/ext-apps";
import { PreviewHost, type PreviewPayload } from "./PreviewHost";
import { StreamingSkeleton } from "./StreamingSkeleton";

const mcpApp = new McpApp(
  { name: "branderux-element-preview", version: "0.1.0" },
  {},
  { autoResize: false }, // height is reported manually (full content height)
);

let setPayload: ((payload: PreviewPayload) => void) | null = null;
let setStreamingName: ((name: string | null) => void) | null = null;

function isPreviewPayload(value: unknown): value is PreviewPayload {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as PreviewPayload).compiledCode === "string" &&
    typeof (value as PreviewPayload).name === "string"
  );
}

function Root() {
  const [payload, _setPayload] = React.useState<PreviewPayload | null>(null);
  const [streamingName, _setStreamingName] = React.useState<string | null>(
    null,
  );
  React.useEffect(() => {
    setPayload = _setPayload;
    setStreamingName = _setStreamingName;
  }, []);
  if (payload) return <PreviewHost payload={payload} />;
  // The host mounts the panel while the tool ARGUMENTS still stream (writing
  // element TSX takes tens of seconds) — show a skeleton, never an empty frame.
  if (streamingName !== null) return <StreamingSkeleton name={streamingName} />;
  return null;
}

/** Element name from streaming tool args, when present (create_element carries it). */
function nameFromArgs(args: unknown): string {
  const name = (args as { name?: unknown } | undefined)?.name;
  return typeof name === "string" ? name : "";
}

mcpApp.ontoolinputpartial = (params) => {
  setStreamingName?.(nameFromArgs(params.arguments));
};
mcpApp.ontoolinput = (params) => {
  setStreamingName?.(nameFromArgs(params.arguments));
};

// The tool result carries the preview in structuredContent.preview.
mcpApp.ontoolresult = (result) => {
  const preview = (
    result.structuredContent as { preview?: unknown } | undefined
  )?.preview;
  if (isPreviewPayload(preview) && setPayload) {
    setPayload(preview);
  }
};

const root = createRoot(document.getElementById("root")!);
root.render(<Root />);

// ---------------------------------------------------------------------------
// Height reporting (pattern from the brander-mcp-tools renderer): debounced,
// full content height — the host owns scrolling on every surface.
// ---------------------------------------------------------------------------
let lastReportedHeight = 0;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;

function reportSize() {
  // No cap on any host: inner scroll doesn't work in mobile iframes — report
  // full content height and let the HOST scroll (mirrors mcp-tools 0.3.1).
  const h = document.documentElement.scrollHeight;
  if (h === lastReportedHeight) return;
  lastReportedHeight = h;
  mcpApp.sendSizeChanged({ height: h }).catch(() => {});
}

function scheduleReportSize() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    reportSize();
  }, 150);
}

mcpApp.connect().then(() => {
  reportSize();
  const observer = new ResizeObserver(() => scheduleReportSize());
  observer.observe(document.body);
  observer.observe(document.documentElement);
});
