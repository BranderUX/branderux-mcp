import { readFileSync } from "node:fs";
const S = "/private/tmp/claude-501/-Users-levkaplun-Desktop-BranderUX-BranderUX-client/d1bc5903-5d5a-4bde-a047-6bfdd5ac7b8c/scratchpad";
const TOKEN = readFileSync(`${S}/agent-token.txt`, "utf8").trim();
let id = 0;
async function rpc(method, params) {
  const res = await fetch("http://localhost:3010/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  const payload = JSON.parse(line ? line.slice(6) : text);
  if (payload.error) throw new Error(JSON.stringify(payload.error));
  return payload.result;
}
async function callTool(name, args = {}) {
  const r = await rpc("tools/call", { name, arguments: args });
  const text = r.content?.map((c) => c.text).join("\n") ?? "";
  return { isError: !!r.isError, text };
}
export { rpc, callTool };
