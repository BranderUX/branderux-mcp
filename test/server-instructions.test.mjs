// Claude Code shows an MCP server's instructions up to 2048 characters and cuts
// the rest ("… [truncated]"), so a rule past that window never reaches the
// model. INSTRUCTIONS is measured as the server sends it (the built string, not
// the source text), and the rules every session needs sit inside the window:
// the hosted arc's never-ask-about-answer-quality rule, publishing as the last
// build step, the BYOK rule, and the WhatsApp line's never-ask-for-a-number-or-
// a-token rule, in that order. Fitting the window keeps what the longer text
// said: generate_screen's playground only when nothing exists yet, the two
// audiences not to be confused, and a phone-number rule that covers connecting
// WhatsApp alone (the hosted arc asks the owner for a phone or an email that
// privacy requests reach, and may store a WhatsApp handoff number).
// Dependency-free (node:test), like its siblings.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { INSTRUCTIONS, INSTRUCTIONS_WINDOW } from "../dist/create-server.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = readFileSync(join(root, "src/create-server.ts"), "utf8");
const hosted = readFileSync(join(root, "src/docs/hosted-agent-contract.md"), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
/** What the model is shown: the window's worth of the instructions, whitespace flattened. */
const shown = flat(INSTRUCTIONS.slice(0, INSTRUCTIONS_WINDOW));

test("the window is Claude Code's 2048 characters, and the instructions fit in it whole", () => {
  assert.equal(INSTRUCTIONS_WINDOW, 2048);
  assert.ok(
    INSTRUCTIONS.length <= INSTRUCTIONS_WINDOW,
    `${INSTRUCTIONS.length} characters: ${INSTRUCTIONS.length - INSTRUCTIONS_WINDOW} past the window`
  );
});

test("the server hands exactly this string to the MCP server", () => {
  assert.match(server, /\{ instructions: INSTRUCTIONS \}/);
});

test("every rule that must reach the model sits inside the window, the BYOK rule before the WhatsApp line", () => {
  const rules = [
    "never ask about answer quality or the AI model",
    "publish_site immediately as the last build step",
    'never ask for, read or echo one; it goes in ONLY through the "Your API key" card under Advanced in the Agent tab\'s Answer quality panel',
    "request_credential tool named model-<provider>",
    "to connect it, never ask for a phone number or a token",
  ];
  let previous = -1;
  for (const rule of rules) {
    const at = shown.indexOf(rule);
    assert.ok(at > previous, `inside the window, in order: ${rule}`);
    previous = at;
  }
});

test("generate_screen: a real project's brand with projectId, the playground only when nothing exists yet", () => {
  assert.ok(
    shown.includes(
      "generate_screen — renders a branded screen in the panel (with projectId: a real project's brand + custom elements; without: the playground, only when nothing exists yet)."
    )
  );
});

test("the two audiences come with the warning not to confuse them", () => {
  assert.ok(shown.includes("Two audiences, don't confuse them: these tools let YOU build BranderUX projects;"));
});

test("the phone-number rule covers connecting WhatsApp only: the hosted arc still asks for a privacy phone and may store a handoff number", () => {
  // Every hosted build is sent to the contract, which asks the owner for ONE
  // email or phone that privacy requests reach and may store a WhatsApp
  // handoff number; a bare "never ask for a phone number" would forbid both.
  assert.match(flat(hosted), /`noticeContact` \(ONE email address or phone number for privacy requests/);
  assert.match(flat(hosted), /both keys optional: `\{"whatsapp": "\+972501234567"/);
  const clauses = shown.split(/[.;]/).filter((clause) => /phone/i.test(clause));
  assert.deepEqual(
    clauses.map((clause) => clause.trim()),
    ["to connect it, never ask for a phone number or a token"],
    "the one clause naming a phone number is the WhatsApp connect's"
  );
  const [line] = INSTRUCTIONS.split("\n").filter((text) => /phone/i.test(text));
  assert.match(line, /^Last, if get_whatsapp_status allows .* offer it once \(read_doc whatsapp-channel\); to connect it, /);
});
