import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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

  await assert.rejects(() => client.request("POST", "https://example.invalid/steal", {}), /чужой origin/);
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

test("dist initialize hands the model non-empty instructions", async () => {
  // Real handshake against the built server over stdio: instructions live in the
  // initialize result, so only a live session proves they survived the build.
  // Dummy credentials are enough — initialize touches no API; telemetry off so
  // the test stays offline.
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
    stderr: "ignore",
    env: {
      ...process.env,
      WORDSTAT_API_KEY: "test-key",
      WORDSTAT_FOLDER_ID: "test-folder",
      ASKADS_TELEMETRY: "0",
    },
  });
  const client = new Client({ name: "dist-smoke", version: "1.0.0" });

  try {
    await client.connect(transport);

    assert.equal(client.getServerVersion()?.name, "mcp-yandex-wordstat");
    const instructions = client.getInstructions();
    assert.equal(typeof instructions, "string");
    // Length floor, not a wording match: catches an empty or placeholder string
    // without pinning the test to the prose.
    assert.ok(instructions.trim().length > 200, "instructions must carry real guidance");
    // The audience is Russian-speaking: the prose must stay localized.
    assert.match(instructions, /[а-яА-Я]/, "instructions must be in Russian");
  } finally {
    await client.close();
  }
});
