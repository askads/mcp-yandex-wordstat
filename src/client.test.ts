import { test } from "node:test";
import assert from "node:assert/strict";
import { WordstatClient } from "./client.js";
import type { WordstatConfig, WordstatFlavor } from "./types.js";

type Call = { url: string; method: string; auth: unknown; body: Record<string, unknown> | undefined };

/** Installs a recording fetch stub and returns a client + the captured calls. */
function harness(flavor: WordstatFlavor, extra: Partial<WordstatConfig> = {}) {
  const calls: Call[] = [];
  const config: WordstatConfig = {
    flavor,
    token: "TKN",
    folderId: flavor === "cloud" ? "fld-1" : undefined,
    apiBase: flavor === "cloud" ? "https://searchapi.api.cloud.yandex.net" : "https://api.wordstat.yandex.net",
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

test("cloud topRequests: /v2 path, Api-Key auth, folderId + string regions + DEVICE_* + numPhrases", async () => {
  const { client, calls, restore } = harness("cloud");
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

test("oauth topRequests: /v1 path, Bearer auth, numeric regions, lowercase devices, no folderId/numPhrases", async () => {
  const { client, calls, restore } = harness("oauth");
  try {
    await client.topRequests({ phrase: "велосипед", regionIds: ["213", 2], devices: ["desktop"], numPhrases: 50 });
  } finally {
    restore();
  }
  assert.equal(calls[0].url, "https://api.wordstat.yandex.net/v1/topRequests");
  assert.equal(calls[0].auth, "Bearer TKN");
  assert.deepEqual(calls[0].body, { phrase: "велосипед", regions: [213, 2], devices: ["desktop"] });
});

test("cloud dynamics maps period to PERIOD_* and injects folderId", async () => {
  const { client, calls, restore } = harness("cloud");
  try {
    await client.dynamics({ phrase: "лыжи", period: "weekly", fromDate: "2026-01-01T00:00:00Z" });
  } finally {
    restore();
  }
  assert.equal(calls[0].url, "https://searchapi.api.cloud.yandex.net/v2/wordstat/dynamics");
  assert.equal(calls[0].body?.period, "PERIOD_WEEKLY");
  assert.equal(calls[0].body?.folderId, "fld-1");
});

test("oauth dynamics keeps lowercase period and omits folderId", async () => {
  const { client, calls, restore } = harness("oauth");
  try {
    await client.dynamics({ phrase: "лыжи", period: "monthly" });
  } finally {
    restore();
  }
  assert.equal(calls[0].body?.period, "monthly");
  assert.equal(calls[0].body?.folderId, undefined);
});

test("cloud regions uses `region` REGION_* mode; oauth uses `regions` string mode", async () => {
  const cloud = harness("cloud");
  try {
    await cloud.client.regions({ phrase: "пицца", regionMode: "cities" });
  } finally {
    cloud.restore();
  }
  assert.equal(cloud.calls[0].url, "https://searchapi.api.cloud.yandex.net/v2/wordstat/regions");
  assert.equal(cloud.calls[0].body?.region, "REGION_CITIES");

  const oauth = harness("oauth");
  try {
    await oauth.client.regions({ phrase: "пицца", regionMode: "cities" });
  } finally {
    oauth.restore();
  }
  assert.equal(oauth.calls[0].body?.regions, "cities");
});

test("regionsTree: oauth GET (no body), cloud POST with folderId", async () => {
  const oauth = harness("oauth");
  try {
    await oauth.client.regionsTree();
  } finally {
    oauth.restore();
  }
  assert.equal(oauth.calls[0].method, "GET");
  assert.equal(oauth.calls[0].url, "https://api.wordstat.yandex.net/v1/getRegionsTree");
  assert.equal(oauth.calls[0].body, undefined);

  const cloud = harness("cloud");
  try {
    await cloud.client.regionsTree();
  } finally {
    cloud.restore();
  }
  assert.equal(cloud.calls[0].method, "POST");
  assert.deepEqual(cloud.calls[0].body, { folderId: "fld-1" });
});

test("non-2xx throws WordstatError carrying the status", async () => {
  const calls: number[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls.push(1);
    return new Response(JSON.stringify({ code: 16, message: "Unauthenticated" }), { status: 401 });
  }) as typeof fetch;
  const client = new WordstatClient({
    flavor: "cloud",
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
