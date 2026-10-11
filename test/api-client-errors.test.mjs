// The API client turns a failed call into an ApiError the model can relay
// (owner-data build SPEC 3 and 6.2). Spring's global error body is
// {timestamp, status, error: "Bad Request", message}: its `error` is only the
// status phrase, so the real reason (the message) must win. OAuth's
// error_description still wins over everything, and the owner-data
// endpoints' own {error: "<sentence>"} is read as it is. fetch is stubbed:
// nothing leaves the process. Dependency-free (node:test) like its siblings.
import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiError, createApiClient } from "../dist/api-client.js";

/** Run one GET against a stubbed fetch answering `status` with `body` (and headers). */
async function failWith(status, body, headers = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  try {
    await createApiClient(async () => "token").get("/projects/p/records/query");
    assert.fail("the call must throw");
  } catch (error) {
    assert.ok(error instanceof ApiError, `an ApiError, not ${error}`);
    assert.equal(error.status, status);
    return error.message;
  } finally {
    globalThis.fetch = original;
  }
}

test("Spring's global body: the message is the reason, not the status phrase", async () => {
  const message = await failWith(400, {
    timestamp: "2026-09-28T10:00:00Z",
    status: 400,
    error: "Bad Request",
    message: 'Unknown field "x"',
  });
  assert.match(message, /Unknown field "x"/);
  assert.doesNotMatch(message, /Bad Request/);
  assert.match(message, /^GET \/projects\/p\/records\/query → 400: /);
});

test("error_description still wins over a Spring message", async () => {
  const message = await failWith(400, {
    status: 400,
    error: "invalid_grant",
    error_description: "The refresh token expired",
    message: "Something else",
  });
  assert.match(message, /The refresh token expired/);
  assert.doesNotMatch(message, /Something else/);
});

test("the owner-data endpoints' {error} sentence is read as it is", async () => {
  const message = await failWith(409, { error: "No CRM is connected. Connect one in Inbox settings." });
  assert.match(message, /409: No CRM is connected\. Connect one in Inbox settings\.$/);
});

test("an empty Spring message falls back to the error field; raw text stays raw", async () => {
  assert.match(await failWith(500, { status: 500, error: "Internal Server Error", message: "" }), /500: Internal Server Error$/);
  assert.match(await failWith(502, "upstream went away"), /502: upstream went away$/);
});

test("a 429 keeps its Retry-After hint in front of the sentence", async () => {
  const message = await failWith(
    429,
    { error: "Your AI assistant already sent 20 records to your CRM today. Send more from the Inbox." },
    { "Retry-After": "120" }
  );
  assert.match(message, /Rate limited\. Retry after 120s\. Your AI assistant already sent 20 records/);
});
