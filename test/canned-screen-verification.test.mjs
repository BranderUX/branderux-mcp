// A canned screen is only as good as the rows behind it. Verification runs
// every binding of the home and of every fixed screen through the REAL serve
// fetcher (the web app, not Spring) and reports rows per binding, so the
// builder learns AT WRITE TIME that a screen will be answered by the live
// agent instead of by the design it just stored.
//
// What this file guards is the whole contract of that addition: the wire
// (POST /api/agent/canned-screens/verify on the app, body {projectId}, the
// report shape), the promise that verification NEVER fails a write or a
// publish, the publish notes, and the `optional` binding flag. Plus the prose
// pins: the tool descriptions, the contract and the prompt are read by a model
// mid-build, so drift there is invisible until a live site answers a designed
// question with a shrug. Dependency-free (node:test) like its siblings.
//
// publish_site is env-gated on the MCP server's own flag, so it is turned on
// before the tools are registered (registration reads it per call).
process.env.AGENTIC_APPS_ENABLED = "1";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { ApiError } from "../dist/api-client.js";
import { AppError } from "../dist/app-client.js";
import { VERIFY_PATH, verificationSchema, verifyCannedScreens } from "../dist/lib/canned-screen-verification.js";
import { registerAgentTools } from "../dist/tools/agent.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
/**
 * A tool description as the MODEL reads it: the source concatenates it out of
 * string literals, so the `" + "` seams are joined before matching. Without
 * this a sentence that happens to straddle two literals would read as absent.
 */
const prose = (text) => flat(text).replace(/" \+ "/g, "");
/** One numbered step of a prompt, up to the next number. */
function step(text, opener, next) {
  const start = text.indexOf(opener);
  assert.notEqual(start, -1, `no step starting "${opener}"`);
  const rest = text.slice(start);
  const end = rest.indexOf(next);
  return rest.slice(0, end === -1 ? undefined : end);
}

const PROJECT = "8f1c2a24-0d3b-4b31-9c0e-5a7e6f1b2c34";
const CONFIG_PATH = `/projects/${PROJECT}/agent-config`;

/** One report exactly as the app's route answers: a failing fixed screen. */
const REPORT = {
  ok: false,
  screens: [
    {
      kind: "home",
      matchQuery: "home",
      screenId: "home-screen",
      ok: true,
      bindings: [
        { path: "grid.items", entityName: "products", optional: false, rows: 24, error: null },
        { path: "strip.items", entityName: "deals", optional: true, rows: 0, error: null },
      ],
      uncoveredQueries: ["do you deliver?"],
    },
    {
      kind: "fixed",
      matchQuery: "show the menu",
      screenId: "menu-screen",
      ok: false,
      bindings: [
        {
          path: "grid.items",
          entityName: "cookware",
          optional: false,
          rows: null,
          error: "Data source answered 403",
        },
      ],
      uncoveredQueries: [],
    },
  ],
  summary: [
    '"show the menu" will be answered by the live agent: grid.items on cookware answered "Data source answered 403"',
  ],
};

/** A fake ApiClient recording every call; `config` is what GET/PUT answer with. */
function fakeApi({ config = {}, get = null } = {}) {
  const calls = { get: [], put: [] };
  return {
    calls,
    get: async (path) => {
      calls.get.push(path);
      return get ? get(path) : config;
    },
    put: async (path, body) => {
      calls.put.push({ path, body });
      return { ...config, ...body };
    },
  };
}

/** A fake AppClient: answers `report`, or throws `throws`, recording each POST. */
function fakeApp({ report = REPORT, throws = null } = {}) {
  const calls = [];
  return {
    calls,
    post: async (path, body) => {
      calls.push({ path, body });
      if (throws) throw throws;
      return report;
    },
  };
}

/** Register the agent tools (api + optional app) and hand back one tool. */
function tool(name, api = fakeApi(), app) {
  const tools = new Map();
  const server = { registerTool: (toolName, config, handler) => tools.set(toolName, { config, handler }) };
  if (app === undefined) registerAgentTools(server, api);
  else registerAgentTools(server, api, app);
  const entry = tools.get(name);
  assert.ok(entry, `${name} is registered`);
  return entry;
}

const homeArgs = {
  projectId: PROJECT,
  matchQuery: "home",
  screenId: "home-screen",
  data: { hero: { title: "Welcome" } },
};
const fixedArgs = {
  projectId: PROJECT,
  screens: [{ matchQuery: "show the menu", screenId: "menu-screen", data: {} }],
};

// --- the wire --------------------------------------------------------------

test("verification is ONE POST to the app: the verify path, body {projectId}", async () => {
  const app = fakeApp();
  await tool("set_fixed_screens", fakeApi(), app).handler(fixedArgs);
  assert.deepEqual(app.calls, [{ path: "/api/agent/canned-screens/verify", body: { projectId: PROJECT } }]);
  assert.equal(VERIFY_PATH, "/api/agent/canned-screens/verify", "the exported path is the one on the wire");
});

test("the app call happens AFTER the write, never instead of it", async () => {
  const api = fakeApi();
  const app = fakeApp();
  await tool("set_home_screen", api, app).handler(homeArgs);
  assert.equal(api.calls.put.length, 1);
  assert.equal(api.calls.put[0].path, CONFIG_PATH);
  assert.equal(app.calls.length, 1);
});

// --- set_fixed_screens / set_home_screen: the report beside the value ------

test("set_fixed_screens returns the report VERBATIM beside the stored set", async () => {
  const result = await tool("set_fixed_screens", fakeApi(), fakeApp()).handler(fixedArgs);
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent.verification, REPORT);
  assert.deepEqual(JSON.parse(result.content[0].text).verification, REPORT);
  assert.ok(Array.isArray(result.structuredContent.fixedScreens), "the stored set still comes back");
});

test("set_home_screen returns the same report beside the stored home", async () => {
  const result = await tool("set_home_screen", fakeApi(), fakeApp()).handler(homeArgs);
  assert.deepEqual(result.structuredContent.verification, REPORT);
  assert.deepEqual(result.structuredContent.homeScreen.matchQuery, "home");
});

test("a report that grew a field survives: the output schema is permissive", () => {
  const grown = {
    ...REPORT,
    checkedAt: "2026-09-17T00:00:00Z",
    screens: [{ ...REPORT.screens[0], durationMs: 12 }],
  };
  for (const name of ["set_fixed_screens", "set_home_screen", "verify_canned_screens"]) {
    const schema = z.object(tool(name).config.outputSchema).passthrough();
    const payload = { fixedScreens: [], homeScreen: {}, verification: grown };
    assert.equal(schema.safeParse(payload).success, true, `${name} refuses a richer report`);
  }
});

// --- verification NEVER fails the write ------------------------------------

test("no app client: the write succeeds and says verification is unavailable", async () => {
  const result = await tool("set_fixed_screens", fakeApi()).handler(fixedArgs);
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent.verification, {
    unavailable: true,
    reason: "this MCP server has no app client configured",
  });
});

test("the app throwing (network, 500) never fails the write", async () => {
  const boom = new Error("fetch failed");
  const result = await tool("set_fixed_screens", fakeApi(), fakeApp({ throws: boom })).handler(fixedArgs);
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent.verification.unavailable, true);
  assert.match(result.structuredContent.verification.reason, /fetch failed/);
});

test("an older app with no verification route reads as unavailable, not as a failure", async () => {
  const notThere = new AppError(404, "POST /api/agent/canned-screens/verify → 404: Not Found");
  const result = await tool("set_home_screen", fakeApi(), fakeApp({ throws: notThere })).handler(homeArgs);
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent.verification, {
    unavailable: true,
    reason: "this app version has no verification route yet",
  });
});

test("any other status is named in the reason", async () => {
  const verification = await verifyCannedScreens(fakeApp({ throws: new AppError(502, "bad gateway") }), PROJECT);
  assert.deepEqual(verification, { unavailable: true, reason: "the verification route answered 502" });
});

test("a body that is not a report is unavailable, never passed on as one", async () => {
  for (const body of [null, {}, { ok: true }, { ok: true, screens: [{}], summary: [] }, "nope"]) {
    const verification = await verifyCannedScreens(fakeApp({ report: body }), PROJECT);
    assert.deepEqual(verification, {
      unavailable: true,
      reason: "the verification route returned an unrecognised report",
    });
  }
});

test("the WRITE's own failure is still the agent's error, verification or not", async () => {
  const api = fakeApi();
  api.put = async () => {
    throw new ApiError(400, "PUT /agent-config → 400: duplicate matchQuery");
  };
  const app = fakeApp();
  const result = await tool("set_fixed_screens", api, app).handler(fixedArgs);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /duplicate matchQuery/);
  assert.deepEqual(app.calls, [], "a refused write is never verified");
});

// --- verify_canned_screens -------------------------------------------------

test("verify_canned_screens passes the project through and returns the report", async () => {
  const api = fakeApi();
  const app = fakeApp();
  const entry = tool("verify_canned_screens", api, app);
  const result = await entry.handler({ projectId: PROJECT });
  assert.deepEqual(app.calls, [{ path: VERIFY_PATH, body: { projectId: PROJECT } }]);
  assert.deepEqual(result.structuredContent, { verification: REPORT });
  assert.deepEqual(api.calls.put, [], "a check never writes");
});

test("verify_canned_screens is READ_ONLY, uuid-gated, and unavailable-safe", async () => {
  const config = tool("verify_canned_screens").config;
  assert.equal(config.annotations.readOnlyHint, true);
  assert.equal(config.annotations.destructiveHint, false);
  assert.equal(z.object(config.inputSchema).safeParse({ projectId: "nope" }).success, false);
  assert.equal(z.object(config.inputSchema).safeParse({ projectId: PROJECT }).success, true);
  const result = await tool("verify_canned_screens").handler({ projectId: PROJECT });
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent.verification.unavailable, true);
});

// --- publish_site ----------------------------------------------------------

/** publish_site with a fake site PUT and an /auth/me + entities read of null. */
function publishTool(app) {
  const api = fakeApi({ get: () => null });
  api.put = async (path, body) => {
    api.calls.put.push({ path, body });
    return { slug: body.slug, status: "live", url: `https://${body.slug}.branderux.app` };
  };
  return { api, entry: tool("publish_site", api, app) };
}

test("publish_site appends ONE note per summary line and stays successful", async () => {
  const { entry } = publishTool(fakeApp());
  const result = await entry.handler({ projectId: PROJECT, slug: "cook-bake" });
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent.url, "https://cook-bake.branderux.app");
  assert.deepEqual(result.structuredContent.notes, REPORT.summary);
});

test("publish_site publishes anyway when verification throws, and carries no note", async () => {
  const { entry } = publishTool(fakeApp({ throws: new Error("fetch failed") }));
  const result = await entry.handler({ projectId: PROJECT, slug: "cook-bake" });
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent.status, "live");
  assert.equal(result.structuredContent.notes, undefined, "unavailable adds nothing to relay");
});

test("a clean report adds no publish note", async () => {
  const { entry } = publishTool(fakeApp({ report: { ok: true, screens: [], summary: [] } }));
  const result = await entry.handler({ projectId: PROJECT, slug: "cook-bake" });
  assert.equal(result.structuredContent.notes, undefined);
});

test("publish notes keep the existing channel: the account note comes first", async () => {
  const api = fakeApi();
  api.get = async (path) => (path === "/auth/me" ? { createdAt: "2026-09-12T00:00:00Z", dpaAccepted: null } : null);
  api.put = async (path, body) => ({ slug: body.slug, status: "live", url: `https://${body.slug}.branderux.app` });
  const result = await tool("publish_site", api, fakeApp()).handler({ projectId: PROJECT, slug: "cook-bake" });
  const notes = result.structuredContent.notes;
  assert.equal(notes.length, 2, "the account note and the screen note both ride");
  assert.equal(notes[1], REPORT.summary[0]);
});

// --- optional bindings -----------------------------------------------------

test("`optional` rides through cannedScreen into the PUT body, on both tools", async () => {
  const binding = { path: "strip.items", entityName: "deals", limit: 6, optional: true };
  const fixedApi = fakeApi();
  await tool("set_fixed_screens", fixedApi, fakeApp()).handler({
    projectId: PROJECT,
    screens: [{ matchQuery: "show the menu", screenId: "menu-screen", data: {}, bindings: [binding] }],
  });
  assert.deepEqual(fixedApi.calls.put[0].body.fixedScreens[0].bindings, [binding]);

  const homeApi = fakeApi();
  await tool("set_home_screen", homeApi, fakeApp()).handler({ ...homeArgs, bindings: [binding] });
  assert.deepEqual(homeApi.calls.put[0].body.homeScreen.bindings, [binding]);
});

test("`optional` is a boolean or absent, and both tools agree (one shared schema)", () => {
  const home = z.object(tool("set_home_screen").config.inputSchema);
  const fixed = z.object(tool("set_fixed_screens").config.inputSchema);
  const cases = [
    [true, { path: "strip.items", entityName: "deals", optional: true }],
    [true, { path: "strip.items", entityName: "deals", optional: false }],
    [true, { path: "strip.items", entityName: "deals" }],
    [false, { path: "strip.items", entityName: "deals", optional: "yes" }],
    [false, { path: "strip.items", entityName: "deals", optional: 1 }],
  ];
  for (const [expected, binding] of cases) {
    const label = JSON.stringify(binding);
    assert.equal(home.safeParse({ ...homeArgs, bindings: [binding] }).success, expected, `home: ${label}`);
    assert.equal(
      fixed.safeParse({
        projectId: PROJECT,
        screens: [{ matchQuery: "m", screenId: "s", data: {}, bindings: [binding] }],
      }).success,
      expected,
      `fixed: ${label}`
    );
  }
});

test("the optional flag says what it means, and what may never carry it", () => {
  const described = prose(read("src/tools/agent.ts"));
  assert.match(described, /A secondary block: when it errors or returns no rows the screen still replays with an empty list/);
  assert.match(described, /Never mark the primary list of a fixed screen optional/);
});

// --- uncovered chips (the coverage half of the report) ---------------------

test("a screen carries uncoveredQueries or omits it, and the report rides through verbatim", async () => {
  const withoutList = { ...REPORT.screens[1] };
  delete withoutList.uncoveredQueries;
  const report = { ...REPORT, screens: [REPORT.screens[0], withoutList] };
  assert.equal(verificationSchema.safeParse(report).success, true, "present on one screen, absent on the other");
  assert.equal(
    verificationSchema.safeParse({ ...REPORT, screens: [{ ...withoutList, uncoveredQueries: [7] }] }).success,
    false,
    "uncoveredQueries is a list of query strings"
  );
  const verification = await verifyCannedScreens(fakeApp({ report }), PROJECT);
  assert.deepEqual(verification, report, "the chips nothing canned answers reach the builder unchanged");
  assert.deepEqual(verification.screens[0].uncoveredQueries, ["do you deliver?"]);
  assert.equal("uncoveredQueries" in verification.screens[1], false, "an absent list stays absent");
});

test("uncovered chips are informational: they never become a publish note", async () => {
  // Some chips are answered live ON PURPOSE (a skill covers them), so a screen
  // that is ok with an uncovered chip publishes silently; only `summary` speaks.
  const report = {
    ok: true,
    screens: [{ ...REPORT.screens[0], ok: true, uncoveredQueries: ["do you deliver?"] }],
    summary: [],
  };
  const { entry } = publishTool(fakeApp({ report }));
  const result = await entry.handler({ projectId: PROJECT, slug: "cook-bake" });
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent.notes, undefined);
});

// --- the prose a model reads mid-build -------------------------------------

const agentTools = prose(read("src/tools/agent.ts"));
const hosted = read("src/docs/hosted-agent-contract.md");
const prompts = read("src/prompts.ts");

/** One "## …" section of a doc, up to the next one. */
function section(doc, heading) {
  const start = doc.indexOf(heading);
  assert.notEqual(start, -1, `the doc is missing "${heading}"`);
  const rest = doc.slice(start);
  const end = rest.indexOf("\n## ", 1);
  return rest.slice(0, end === -1 ? undefined : end);
}

const HOME = section(hosted, "## Home screen — canned first paint (`set_home_screen`)");
const ARC_STEP = step(hosted, "5. `set_home_screen`", "\n6. ");
const FIXED = section(hosted, "## Fixed screens for fixed queries (`set_fixed_screens`)");
const BLOCKED = section(hosted, "## When a store blocks our fetcher");
const PROMPT_STEP = step(prompts, "7. put_screen the screens", "\n8. ");

test("both write tools tell the agent to read verification, in the same words", () => {
  const sentence =
    /The result's verification tells you whether each screen will actually replay: a screen with ok:false is answered by the live agent until you fix it \(the summary says what failed\), and each screen's uncoveredQueries lists the chip queries on it that no canned screen answers, every one of them answered live: keep one that way only where a skill covers it on purpose or where the chip fires a write tool \(an action chip that collects fields and books, orders or sends\), and give each of the others a fixed screen\./g;
  assert.equal((agentTools.match(sentence) || []).length, 2, "set_home_screen and set_fixed_screens both say it");
});

test("the INTERCEPTION rule is stated once among the descriptions, in set_fixed_screens", () => {
  const sentence =
    /a chip on the home's queries list, a custom page or a link on the owner's site whose query equals a stored matchQuery \(or the home's\) is answered by that screen BEFORE any AI runs, with the visitor's own words entering the conversation above the designed screen, so a chip's query and its screen's matchQuery must be identical, character for character/g;
  assert.equal((agentTools.match(sentence) || []).length, 1, "said once, where the verbatim rule lives");
  assert.doesNotMatch(agentTools, /must carry that query VERBATIM/, "the old wording implied a chip could never reach the screen");
});

test("list_fixed_screens reads what is STORED; coverage comes from the verification", () => {
  assert.match(agentTools, /It reads what is actually STORED, so check here instead of recalling what was written\./);
  assert.match(
    agentTools,
    /verify_canned_screens reports the chip queries nothing canned answers, and list_skills is how you confirm that a query left to the live agent is one a skill covers on purpose/
  );
});

test("probe_api says a probe is not proof", () => {
  assert.match(
    agentTools,
    /A probe shows the SHAPE of a response; it is never proof that a binding will serve \(serving fetches through the same channel now, but rows are proven only by verification\)\./
  );
});

test("verify_canned_screens describes itself in plain words, including the 403 sentence", () => {
  assert.match(agentTools, /"verify_canned_screens"/);
  assert.match(agentTools, /through the REAL serve fetcher and report how many rows each one actually returns/);
  assert.match(agentTools, /answered by the LIVE agent instead/);
  assert.match(agentTools, /Call it before publish_site/);
  assert.match(
    agentTools,
    /Each entry also carries uncoveredQueries: the chip queries on that screen that no canned screen answers, every one of them answered live by the agent, so keep one that way only where a skill covers it on purpose or where the chip fires a write tool \(an action chip that collects fields and books, orders or sends\), and give each of the others a fixed screen\./
  );
  assert.match(agentTools, /User-Agent contains BranderUX-Connector\/1\.0/);
  assert.match(agentTools, /WAF skip rule/);
});

test("the 403 sentence lives in ONE description, not in every one that mentions rows", () => {
  assert.equal((agentTools.match(/BranderUX-Connector\/1\.0/g) || []).length, 1);
});

test("the home-screen section carries the ONE verification rule, and the optional flag", () => {
  const text = flat(HOME);
  assert.match(text, /\*\*Verification \(this screen and every fixed screen\)\.\*\* The write answers with `verification`/);
  assert.match(text, /REAL serve fetcher/);
  assert.match(text, /A screen with `ok: false` is NOT replayed/);
  assert.match(text, /Read the report after every `set_home_screen` and every `set_fixed_screens`/);
  assert.match(text, /mark a secondary block `optional`, never the primary list/);
  assert.match(text, /Call `verify_canned_screens` again before `publish_site`/);
  assert.match(text, /repeats the failing sentences in its `notes` and never refuses to publish/);
  assert.match(text, /`verification: \{unavailable, reason\}` means the check could not run/);
  assert.match(text, /a probe shows the SHAPE of a response, never that a binding serves rows/);
  assert.match(text, /`optional: true` marks a SECONDARY block/);
});

test("the fixed-screens section cross-references that rule instead of repeating it", () => {
  const text = flat(FIXED);
  assert.match(text, /\*\*Verification\.\*\* `set_fixed_screens` answers with `verification`, the same report the home's write carries and under the same rule: see "Verification \(this screen and every fixed screen\)" under "Home screen" above/);
  assert.match(text, /answered by the live agent until it is fixed/);
  assert.match(text, /The primary list of a fixed screen stays required/);
  assert.doesNotMatch(text, /call `verify_canned_screens` again before `publish_site`/, "the publish rule is stated once, in the home section");
  assert.doesNotMatch(text, /means the check could not run/, "the unavailable rule too");
});

test("the uncovered list is the contract's coverage rule, stated in the fixed-screens section", () => {
  const text = flat(FIXED);
  assert.match(text, /\*\*Coverage is read, not remembered\.\*\*/);
  assert.match(text, /Every `verification` reports, per screen, `uncoveredQueries`: the queries carried by chips on that screen that neither the home nor any fixed screen answers/);
  assert.match(text, /Each of them is answered LIVE by the agent, so keep one that way only where a skill covers it on purpose \(`list_skills` says which\) or where the chip fires a write tool \(an action chip that collects fields and books, orders or sends\), and give each of the others a fixed screen/);
  assert.match(text, /`list_fixed_screens` reads back what is actually stored/);
});

test("the contract states the INTERCEPTION once, where the verbatim rule lives", () => {
  const sentences =
    flat(hosted).match(/is answered by that screen BEFORE any AI runs/g) || [];
  assert.equal(sentences.length, 1, "one statement, in the fixed-screens section");
  assert.match(
    flat(FIXED),
    /whose query equals a stored `matchQuery` \(or the home's\) is answered by that screen BEFORE any AI runs: the visitor's own words enter the conversation and the designed screen comes back under them, exactly as a click on a custom page does\. So a chip's query and its screen's `matchQuery` must be identical, character for character/
  );
});

test("an action chip answers itself: a write tool is a live answerer on every surface", () => {
  // uncoveredQueries collects EVERY chip query, the one action chip of a widget
  // home included (kind "action" fires a write with fields). A rule that let only
  // a SKILL justify a live answer told the builder to design a fixed screen for a
  // booking, which no canned screen can serve. All four surfaces name the write
  // tool, the same way the askable test already names it.
  const clause =
    /keep one that way only where a skill covers it on purpose or where the chip fires a write tool \(an action chip that collects fields and books, orders or sends\)/g;
  assert.equal(
    (agentTools.match(clause) || []).length,
    3,
    "set_home_screen, set_fixed_screens and verify_canned_screens all say it"
  );
  assert.doesNotMatch(agentTools, /only where a skill covers it on purpose,? and give/, "the skill-only clause is gone");
  assert.match(
    flat(FIXED),
    /where the chip fires a write tool \(an action chip that collects fields and books, orders or sends\), and give each of the others a fixed screen/
  );
  assert.match(
    flat(PROMPT_STEP),
    /leave it live only where one of my skills covers it on purpose or where the chip itself collects the details and places the booking or the order/
  );
});

test("the blocked-store section says exactly what the owner must allow", () => {
  const text = flat(BLOCKED);
  assert.match(text, /answers every non-browser client with 403/);
  assert.match(text, /"Data source answered 403"/);
  assert.match(text, /User-Agent contains `BranderUX-Connector\/1\.0`/);
  assert.match(text, /on Cloudflare that is a WAF skip rule/);
  assert.match(text, /Verify again after they change it/);
});

test("the build arc and the build order both route through verification", () => {
  assert.match(flat(hosted), /run `verify_canned_screens` before you publish/);
  assert.match(flat(section(hosted, "## Build order (hosted)")), /`verify_canned_screens` \(rows proven, not assumed\)/);
});

test("the arc POINTS at the verification rules; it does not restate them", () => {
  // The arc and the build order are indexes. The rule itself (what ok:false
  // means, what uncoveredQueries means) is stated once, in the sections below.
  assert.match(flat(ARC_STEP), /both rules, and the coverage that report names, are under "Fixed screens for fixed queries"/);
  assert.doesNotMatch(ARC_STEP, /answered by the live agent/, "the consequence belongs to the Home screen section");
  assert.doesNotMatch(ARC_STEP, /uncoveredQueries/, "the coverage rule belongs to the two sections it points at");
});

test("the hosted prompt's step 7 says it in the owner's voice", () => {
  const text = flat(PROMPT_STEP);
  assert.match(text, /read the verification that comes back with it/);
  assert.match(text, /answered by the live agent instead of the page you designed/);
  assert.match(text, /mark a side block optional, never the main list of the screen/);
  assert.match(
    text,
    /The same report names, per screen, the questions on it that nothing canned answers: every one of those is answered live, so leave it live only where one of my skills covers it on purpose or where the chip itself collects the details and places the booking or the order, and give each of the others a fixed screen\./
  );
  assert.match(text, /A probe of an API is never proof/);
  assert.match(text, /Run verify_canned_screens before you publish/);
  assert.match(text, /User-Agent contains BranderUX-Connector\/1\.0/);
});

test("the primary-list guard reads the same on all three surfaces the model sees", () => {
  // Tool description, contract and prompt each say a side block may be marked
  // optional AND that the screen's main list may not. One of the three drifting
  // is invisible until a live site drops the page it was meant to replay.
  assert.match(agentTools, /Never mark the primary list of a fixed screen optional/);
  assert.match(flat(FIXED), /The primary list of a fixed screen stays required/);
  assert.match(flat(PROMPT_STEP), /mark a side block optional, never the main list of the screen/);
});

test("the bindings grammar the model copies from carries no em dash", () => {
  // set_home_screen's binding grammar is read and copied verbatim by a model;
  // the rest of that description predates the em-dash rule, so pin the sentence
  // this change touched rather than the whole literal.
  const grammar = agentTools.slice(
    agentTools.indexOf("bindings = where the live rows go"),
    agentTools.indexOf("items sorted by price)") + "items sorted by price)".length
  );
  assert.ok(grammar.length > 0, "the bindings grammar sentence is missing");
  // The source escapes its own quotes, so match from entityName on.
  assert.match(grammar, /entityName, filters\?, sort\?, limit\?, optional\?\}, e\.g\. on-sale items sorted by price\)/);
  assert.equal(grammar.includes("\u2014"), false, "the bindings grammar carries an em dash");
});

test("everything rewritten here is em-dash free (owners and models read it)", () => {
  const description = (tool) => {
    const start = agentTools.indexOf(`"${tool}", { title:`);
    assert.notEqual(start, -1, `${tool} is not registered`);
    return agentTools.slice(start, agentTools.indexOf("inputSchema:", start));
  };
  const added = [
    ["the home-screen verification paragraph", HOME.slice(HOME.indexOf("**Verification ("))],
    ["the fixed-screens verification paragraph", FIXED.slice(FIXED.indexOf("**Verification.**"))],
    ["the fixed-screens coverage bullet", FIXED.slice(FIXED.indexOf("**Coverage is read"))],
    ["the interception bullet", FIXED.slice(FIXED.indexOf("**The match is EXACT**"))],
    ["When a store blocks our fetcher", BLOCKED],
    ["the arc's home step", ARC_STEP],
    ["the hosted prompt's step 7", PROMPT_STEP],
    ["set_fixed_screens' description", description("set_fixed_screens")],
    ["verify_canned_screens' description", description("verify_canned_screens")],
    ["list_fixed_screens' description", description("list_fixed_screens")],
  ];
  for (const [name, text] of added) {
    assert.ok(text.length > 0, `${name} is missing`);
    assert.equal(text.includes("—"), false, `${name} carries an em dash`);
  }
});
