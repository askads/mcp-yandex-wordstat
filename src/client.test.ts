import { test } from "node:test";
import assert from "node:assert/strict";
import { WordstatClient } from "./client.js";
import type { WordstatConfig } from "./types.js";

type Call = { url: string; method: string; auth: unknown; body: Record<string, unknown> | undefined };

/** Installs a recording fetch stub and returns a client + the captured calls. */
function harness(extra: Partial<WordstatConfig> = {}) {
  const calls: Call[] = [];
  const config: WordstatConfig = {
    token: "TKN",
    folderId: "fld-1",
    apiBase: "https://searchapi.api.cloud.yandex.net",
    lang: "ru",
    maxRetries: 0,
    ...extra,
  };

  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init: { method: string; headers: Record<string, string>; body?: string }) => {
    calls.push({
      url: String(url),
      method: init.method,
      auth: init.headers.Authorization,
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  return { client: new WordstatClient(config), calls, restore: () => { globalThis.fetch = orig; } };
}

test("topRequests: /v2 path, Api-Key auth, folderId + string regions + DEVICE_* + numPhrases", async () => {
  const { client, calls, restore } = harness();
  try {
    await client.topRequests({ phrase: "велосипед", regionIds: [213, "2"], devices: ["phone", "all"], numPhrases: 50 });
  } finally {
    restore();
  }
  assert.equal(calls[0].url, "https://searchapi.api.cloud.yandex.net/v2/wordstat/topRequests");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].auth, "Api-Key TKN");
  assert.deepEqual(calls[0].body, {
    folderId: "fld-1",
    phrase: "велосипед",
    numPhrases: 50,
    regions: ["213", "2"],
    devices: ["DEVICE_PHONE", "DEVICE_ALL"],
  });
});

test("dynamics maps period to PERIOD_* and injects folderId", async () => {
  const { client, calls, restore } = harness();
  try {
    await client.dynamics({ phrase: "лыжи", period: "weekly", fromDate: "2026-01-01T00:00:00Z" });
  } finally {
    restore();
  }
  assert.equal(calls[0].url, "https://searchapi.api.cloud.yandex.net/v2/wordstat/dynamics");
  assert.equal(calls[0].body?.period, "PERIOD_WEEKLY");
  assert.equal(calls[0].body?.folderId, "fld-1");
});

test("regions uses `region` REGION_* mode and injects folderId", async () => {
  const { client, calls, restore } = harness();
  try {
    await client.regions({ phrase: "пицца", regionMode: "cities" });
  } finally {
    restore();
  }
  assert.equal(calls[0].url, "https://searchapi.api.cloud.yandex.net/v2/wordstat/regions");
  assert.equal(calls[0].body?.region, "REGION_CITIES");
  assert.equal(calls[0].body?.folderId, "fld-1");
});

test("regionsTree: POST to /v2 with folderId only", async () => {
  const { client, calls, restore } = harness();
  try {
    await client.regionsTree();
  } finally {
    restore();
  }
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, "https://searchapi.api.cloud.yandex.net/v2/wordstat/getRegionsTree");
  assert.deepEqual(calls[0].body, { folderId: "fld-1" });
});

test("non-2xx throws WordstatError carrying the status", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ code: 16, message: "Unauthenticated" }), { status: 401 })) as typeof fetch;
  const client = new WordstatClient({
    token: "bad",
    folderId: "f",
    apiBase: "https://searchapi.api.cloud.yandex.net",
    lang: "ru",
    maxRetries: 0,
  });
  try {
    await assert.rejects(() => client.topRequests({ phrase: "x" }), /HTTP 401/);
  } finally {
    globalThis.fetch = orig;
  }
});
