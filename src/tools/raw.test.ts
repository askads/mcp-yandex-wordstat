import { test } from "node:test";
import assert from "node:assert/strict";
import { WordstatClient } from "../client.js";
import { registerRawTool } from "./raw.js";

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<{ content: { text: string }[]; isError?: boolean }>;

/** Registers raw_request against a real client with a recording fetch stub. */
function harness() {
  const original = globalThis.fetch;
  const calls: { url: string; method: string; body: unknown }[] = [];
  globalThis.fetch = (async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as { method: string; body?: string };
    calls.push({ url: String(url), method: i.method, body: i.body ? JSON.parse(i.body) : undefined });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  const client = new WordstatClient({
    token: "TKN",
    folderId: "fld-1",
    apiBase: "https://searchapi.api.cloud.yandex.net",
    lang: "ru",
    maxRetries: 0,
  });
  const tools: Record<string, Handler> = {};
  const server = { registerTool: (name: string, _cfg: unknown, h: Handler) => { tools[name] = h; } };
  registerRawTool(server as never, client);
  return { tools, calls, restore: () => { globalThis.fetch = original; } };
}

test("raw_request defaults to POST and injects folderId into the body", async () => {
  const { tools, calls, restore } = harness();
  try {
    const res = await tools.raw_request({ path: "v2/wordstat/topRequests", body: { phrase: "x" } });
    assert.equal(res.isError, undefined);
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, "https://searchapi.api.cloud.yandex.net/v2/wordstat/topRequests");
    assert.deepEqual(calls[0].body, { folderId: "fld-1", phrase: "x" });
  } finally {
    restore();
  }
});

test("raw_request rejects an absolute path as an isError result, without fetching", async () => {
  for (const evil of ["https://evil.example/steal", "http://evil.example/x", "\\\\evil.example/x"]) {
    const { tools, calls, restore } = harness();
    try {
      const res = await tools.raw_request({ path: evil, body: {} });
      assert.equal(res.isError, true, `${JSON.stringify(evil)} should be isError`);
      assert.match(res.content[0].text, /чужой origin/);
      assert.equal(calls.length, 0, `must not fetch for ${JSON.stringify(evil)}`);
    } finally {
      restore();
    }
  }
});
