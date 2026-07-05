import assert from "node:assert/strict";
import test from "node:test";

import { WordstatClient } from "../dist/client.js";
import { registerRawTool } from "../dist/tools/raw.js";
import { registerWordstatTools } from "../dist/tools/wordstat.js";

test("dist client rejects foreign-origin paths before sending the API key", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };

  const client = new WordstatClient({
    token: "SECRET",
    folderId: "folder",
    lang: "ru",
    apiBase: "https://searchapi.api.cloud.yandex.net",
    timeoutMs: 1000,
    maxRetries: 0,
  });

  await assert.rejects(() => client.request("POST", "https://example.invalid/steal", {}), /foreign origin/);
  assert.equal(called, false);
});

test("dist client injects folderId into POST bodies", async () => {
  let sent;
  globalThis.fetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response('{"ok":true}', { status: 200 });
  };

  const client = new WordstatClient({
    token: "SECRET",
    folderId: "folder",
    lang: "ru",
    apiBase: "https://searchapi.api.cloud.yandex.net",
    timeoutMs: 1000,
    maxRetries: 0,
  });

  await client.request("POST", "v2/wordstat/topRequests", { phrase: "test" });
  assert.equal(sent.folderId, "folder");
  assert.equal(sent.phrase, "test");
});

test("dist registers the expected read-only tools", () => {
  const names = [];
  const server = {
    registerTool(name) {
      names.push(name);
    },
  };
  const client = {};

  registerWordstatTools(server, client);
  registerRawTool(server, client);

  assert.deepEqual(names.sort(), [
    "dynamics",
    "list_regions",
    "raw_request",
    "regions",
    "top_requests",
  ]);
});
