// A project has an owner and zero or more MANAGERS the owner added from the
// app's project settings. The API lists the projects the caller owns OR
// manages, each row carrying `myRole` beside the owner's identity, and a
// project read carries the OWNER's data-processing acceptance
// (`ownerDpaAccepted`). This suite pins what the MCP makes of that:
//   - whoami names the caller's role per project and, on a manager's row, the owner;
//   - list_projects passes the rows through and its description says who may do what;
//   - publish_site judges the engagement note from the OWNER's acceptance when the
//     caller only manages the project, and from the caller's account otherwise
//     (or when the project could not be read), exactly as before roles existed.
// Dependency-free (node:test) like the rest of this suite.
import assert from "node:assert/strict";
import { test } from "node:test";

// publish_site only registers with the agentic-apps switch on; set it before
// the import that registers the tools.
process.env.AGENTIC_APPS_ENABLED = "1";

const { registerProjectTools } = await import("../dist/tools/projects.js");
const { registerAgentTools } = await import("../dist/tools/agent.js");
const { DPA_PUBLISH_NOTE, acceptedOrGrandfathered, isDpaAccepted } = await import("../dist/lib/dpa.js");

const PROJECT = "8f1c2a24-0d3b-4b31-9c0e-5a7e6f1b2c34";
const ACCEPTED_ME = { id: "u1", email: "me@example.com", dpaAccepted: { version: "2026-09-11", at: "2026-09-12T09:30:00Z" } };
const UNACCEPTED_ME = { id: "u1", email: "me@example.com", dpaAccepted: null, createdAt: "2026-09-12T08:00:00Z" };
const OWNER_ACCEPTED = { version: "2026-09-11", acceptedAt: "2026-09-13T10:00:00Z" };

const OWNED_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Blossom",
  myRole: "owner",
  ownerId: "u1",
  ownerIdentifier: "google:u1",
  ownerEmail: "me@example.com",
  ownerDisplayName: "Me Myself",
};
const MANAGED_ROW = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Nova",
  myRole: "manager",
  ownerId: "u2",
  ownerIdentifier: "google:u2",
  ownerEmail: "ana@example.com",
  ownerDisplayName: "Ana Levi",
};

/**
 * A fake ApiClient: `me` answers /auth/me, `projects` the list, `project` the
 * one read (throwing when asked to), `entities` the entity list.
 */
function fakeApi({ me = {}, projects = [], project = null, projectThrows = false, entities = [] } = {}) {
  const calls = { get: [], put: [] };
  return {
    calls,
    get: async (path) => {
      calls.get.push(path);
      if (path === "/auth/me") return me;
      if (path === "/projects") return projects;
      if (path === `/projects/${PROJECT}`) {
        if (projectThrows) throw new Error("project read failed");
        return project;
      }
      if (path.endsWith("/entities")) return entities;
      return [];
    },
    put: async (path, body) => {
      calls.put.push({ path, body });
      return { slug: body.slug, status: "live", url: `https://${body.slug}.branderux.app` };
    },
  };
}

function handler(register, api, name) {
  const tools = new Map();
  register({ registerTool: (toolName, _config, fn) => tools.set(toolName, fn) }, api);
  const found = tools.get(name);
  assert.ok(found, `${name} is registered`);
  return found;
}

function config(register, api, name) {
  const configs = new Map();
  register({ registerTool: (toolName, toolConfig) => configs.set(toolName, toolConfig) }, api);
  const found = configs.get(name);
  assert.ok(found, `${name} is registered`);
  return found;
}

const whoami = (api) => handler(registerProjectTools, api, "whoami");
const listProjects = (api) => handler(registerProjectTools, api, "list_projects");
const publishSite = (api) => handler(registerAgentTools, api, "publish_site");
const publish = (api) => publishSite(api)({ projectId: PROJECT, slug: "blossom" });

test("whoami: an owned project is {id, name, role: owner} with no owner field; a managed one names the owner", async () => {
  const api = fakeApi({ me: ACCEPTED_ME, projects: [OWNED_ROW, MANAGED_ROW] });
  const result = await whoami(api)({});
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent.projects, [
    { id: OWNED_ROW.id, name: "Blossom", role: "owner" },
    { id: MANAGED_ROW.id, name: "Nova", role: "manager", owner: "Ana Levi" },
  ]);
  // The rows are reduced, never spread: the server's owner columns stay off the wire.
  for (const row of result.structuredContent.projects) {
    assert.equal("ownerEmail" in row, false);
    assert.equal("myRole" in row, false);
  }
});

test("whoami: a row from before roles shipped (no myRole) is the caller's own project", async () => {
  const { myRole: _dropped, ...legacyRow } = OWNED_ROW;
  const api = fakeApi({ me: ACCEPTED_ME, projects: [legacyRow] });
  const { structuredContent } = await whoami(api)({});
  assert.deepEqual(structuredContent.projects, [{ id: OWNED_ROW.id, name: "Blossom", role: "owner" }]);
});

test("whoami: a manager's row falls through to the owner's email when there is no display name", async () => {
  const noName = { ...MANAGED_ROW, ownerDisplayName: null };
  const blankName = { ...MANAGED_ROW, ownerDisplayName: "   " };
  const nothing = { ...MANAGED_ROW, ownerDisplayName: null, ownerEmail: null };
  const api = fakeApi({ me: ACCEPTED_ME, projects: [noName, blankName, nothing] });
  const { structuredContent } = await whoami(api)({});
  assert.equal(structuredContent.projects[0].owner, "ana@example.com");
  assert.equal(structuredContent.projects[1].owner, "ana@example.com");
  assert.equal(structuredContent.projects[2].role, "manager");
  assert.equal("owner" in structuredContent.projects[2], false);
});

test("whoami's description says the projects are owned or managed and that a manager's row names the owner", () => {
  const { description } = config(registerProjectTools, fakeApi(), "whoami");
  assert.match(description, /own or manage/);
  assert.match(description, /`role`/);
  assert.match(description, /manager's row names the `owner`/);
  // The DPA sentences the dpa-acceptance suite pins are still there.
  assert.match(description, /dpaAccepted/);
  assert.match(description, /the owner's acceptance is what counts/);
});

test("list_projects passes the server rows through, myRole and owner columns included", async () => {
  const api = fakeApi({ projects: [OWNED_ROW, MANAGED_ROW] });
  const { structuredContent } = await listProjects(api)({});
  assert.deepEqual(structuredContent.projects, [OWNED_ROW, MANAGED_ROW]);
});

test("list_projects' description names managers, what they may do, and what stays with the owner", () => {
  const { description } = config(registerProjectTools, fakeApi(), "list_projects");
  assert.match(description, /^List the projects the user owns or manages\./);
  assert.match(description, /`myRole` \(owner or manager\)/);
  assert.match(description, /owner's name and email/);
  assert.match(description, /managers can build, publish, manage API keys and hand the project over to a new owner/);
  assert.match(description, /only the owner can delete the project or add and remove managers/);
  assert.match(description, /app's project settings/);
});

test("publish_site as a MANAGER: the engagement note follows the OWNER's acceptance, not the caller's", async () => {
  // The owner never accepted; the manager's own account did: the note appears.
  const ownerUnaccepted = fakeApi({
    me: ACCEPTED_ME,
    project: { id: PROJECT, myRole: "manager", ownerDpaAccepted: null },
  });
  const noted = await publish(ownerUnaccepted);
  assert.notEqual(noted.isError, true, "publishing is never refused over the engagement");
  assert.equal(noted.structuredContent.url, "https://blossom.branderux.app");
  assert.deepEqual(noted.structuredContent.notes, [DPA_PUBLISH_NOTE]);
  assert.match(noted.structuredContent.notes[0], /ask the owner/);
  assert.equal(ownerUnaccepted.calls.get.includes("/auth/me"), false, "the manager's own account is not consulted");

  // The owner accepted; the manager's own account never did: no note.
  const ownerAccepted = fakeApi({
    me: UNACCEPTED_ME,
    project: { id: PROJECT, myRole: "manager", ownerDpaAccepted: OWNER_ACCEPTED },
  });
  const quiet = await publish(ownerAccepted);
  assert.notEqual(quiet.isError, true);
  assert.equal("notes" in quiet.structuredContent, false);
});

test("publish_site as a MANAGER: a GRANDFATHERED owner (account before 2026-09-11) who never clicked gets no note", async () => {
  // The owner's creation time rides as a bare LocalDateTime, read as UTC like the caller's own.
  const api = fakeApi({
    me: UNACCEPTED_ME,
    project: { id: PROJECT, myRole: "manager", ownerDpaAccepted: null, ownerCreatedAt: "2026-08-01T10:00:00" },
  });
  const result = await publish(api);
  assert.notEqual(result.isError, true);
  assert.equal("notes" in result.structuredContent, false);
  assert.equal(api.calls.get.includes("/auth/me"), false, "the manager's own (unaccepted) account is not consulted");
});

test("publish_site as a MANAGER: a NEW owner (account on or after the cutoff) who never clicked gets the note", async () => {
  const api = fakeApi({
    me: ACCEPTED_ME,
    project: { id: PROJECT, myRole: "manager", ownerDpaAccepted: null, ownerCreatedAt: "2026-09-12T08:00:00Z" },
  });
  const result = await publish(api);
  assert.notEqual(result.isError, true, "never refused");
  assert.deepEqual(result.structuredContent.notes, [DPA_PUBLISH_NOTE]);
});

test("acceptedOrGrandfathered: the one rule both accounts share", () => {
  // A click settles it, whatever the age.
  assert.equal(acceptedOrGrandfathered(OWNER_ACCEPTED, undefined), true);
  assert.equal(acceptedOrGrandfathered(true, "2026-09-20T00:00:00Z"), true);
  // No click: the account's age decides, at 2026-09-11T00:00:00Z, bare timestamps read as UTC.
  assert.equal(acceptedOrGrandfathered(null, "2026-09-10T23:59:59"), true);
  assert.equal(acceptedOrGrandfathered(null, "2026-09-11T00:00:00Z"), false);
  assert.equal(acceptedOrGrandfathered(null, "2026-09-11T02:00:00+03:00"), true);
  // No click and no readable age: the acceptance alone, so not accepted.
  for (const createdAt of [undefined, null, "", "not a date", 1725000000]) {
    assert.equal(acceptedOrGrandfathered(null, createdAt), false, `createdAt ${JSON.stringify(createdAt)}`);
  }
});

test("publish_site as the OWNER keeps judging the caller's own account", async () => {
  const unaccepted = fakeApi({
    me: UNACCEPTED_ME,
    project: { id: PROJECT, myRole: "owner", ownerDpaAccepted: null },
  });
  assert.deepEqual((await publish(unaccepted)).structuredContent.notes, [DPA_PUBLISH_NOTE]);
  assert.ok(unaccepted.calls.get.includes("/auth/me"));

  const accepted = fakeApi({
    me: ACCEPTED_ME,
    project: { id: PROJECT, myRole: "owner", ownerDpaAccepted: null },
  });
  assert.equal("notes" in (await publish(accepted)).structuredContent, false);
});

test("publish_site when the project cannot be read (error, absent, or an older API without myRole) falls back to the caller's account", async () => {
  for (const api of [
    fakeApi({ me: UNACCEPTED_ME, projectThrows: true }),
    fakeApi({ me: UNACCEPTED_ME, project: null }),
    fakeApi({ me: UNACCEPTED_ME, project: { id: PROJECT, name: "Blossom" } }),
  ]) {
    const result = await publish(api);
    assert.notEqual(result.isError, true);
    assert.equal(result.structuredContent.status, "live");
    assert.deepEqual(result.structuredContent.notes, [DPA_PUBLISH_NOTE]);
  }
  // ... and an accepted caller still earns no note on those same paths.
  const accepted = fakeApi({ me: ACCEPTED_ME, projectThrows: true });
  assert.equal("notes" in (await publish(accepted)).structuredContent, false);
});

test("the site is published BEFORE the project is read; the role lookup never gates it", async () => {
  const api = fakeApi({
    me: ACCEPTED_ME,
    project: { id: PROJECT, myRole: "manager", ownerDpaAccepted: null },
  });
  await publish(api);
  assert.deepEqual(api.calls.put, [{ path: `/projects/${PROJECT}/site`, body: { slug: "blossom" } }]);
  assert.ok(api.calls.get.includes(`/projects/${PROJECT}`));
});

test("isDpaAccepted: the acceptance object in either wire spelling, or a flattened true; nothing else", () => {
  assert.equal(isDpaAccepted(OWNER_ACCEPTED), true);
  assert.equal(isDpaAccepted({ version: "2026-09-11", at: "2026-09-12T09:30:00Z" }), true);
  assert.equal(isDpaAccepted(true), true);
  for (const value of [null, undefined, false, "yes", [], 1]) {
    assert.equal(isDpaAccepted(value), false, `${JSON.stringify(value)} is not an acceptance`);
  }
});
