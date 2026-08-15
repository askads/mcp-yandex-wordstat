import { test } from "node:test";
import assert from "node:assert/strict";
import { WordstatClient } from "./client.js";
import { CredentialsError } from "./types.js";
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

// --- Retry / timeout / SSRF behavior ---

const BASE = "https://searchapi.api.cloud.yandex.net";

function makeClient(overrides: Partial<WordstatConfig> = {}) {
  return new WordstatClient({
    token: "T",
    folderId: "fld-1",
    apiBase: BASE,
    lang: "ru",
    retryBaseMs: 0, // no real backoff delay in tests
    ...overrides,
  });
}

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as RequestInit;
    calls.push({ url: String(url), init: i });
    return handler(String(url), i);
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

test("request() retries a 429 rate limit then returns the result", async () => {
  let calls = 0;
  const mock = mockFetch(() => {
    calls++;
    if (calls === 1) return new Response("rate limited", { status: 429 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  try {
    const result = await makeClient().topRequests({ phrase: "x" });
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 2);
  } finally {
    mock.restore();
  }
});

test("request() retries a 5xx then returns the result", async () => {
  let calls = 0;
  const mock = mockFetch(() => {
    calls++;
    if (calls === 1) return new Response("unavailable", { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  try {
    const result = await makeClient().topRequests({ phrase: "x" });
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 2);
  } finally {
    mock.restore();
  }
});

test("request() does not retry a 400 and gives up after maxRetries on 429", async () => {
  let calls = 0;
  const mock = mockFetch(() => {
    calls++;
    return new Response("nope", { status: 400 });
  });
  try {
    await assert.rejects(() => makeClient().topRequests({ phrase: "x" }), /HTTP 400/);
    assert.equal(calls, 1);
  } finally {
    mock.restore();
  }

  calls = 0;
  const mock2 = mockFetch(() => {
    calls++;
    return new Response("slow down", { status: 429 });
  });
  try {
    await assert.rejects(() => makeClient({ maxRetries: 2 }).topRequests({ phrase: "x" }), /HTTP 429/);
    assert.equal(calls, 3); // initial + 2 retries
  } finally {
    mock2.restore();
  }
});

test("request() retries a network error for reads then succeeds", async () => {
  let calls = 0;
  const mock = mockFetch(() => {
    calls++;
    if (calls === 1) throw new Error("ECONNRESET");
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  try {
    const result = await makeClient().topRequests({ phrase: "x" });
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 2);
  } finally {
    mock.restore();
  }
});

test("request() rethrows the network error after maxRetries", async () => {
  let calls = 0;
  const mock = mockFetch(() => {
    calls++;
    throw new Error("ECONNRESET");
  });
  try {
    await assert.rejects(() => makeClient({ maxRetries: 2 }).topRequests({ phrase: "x" }), /ECONNRESET/);
    assert.equal(calls, 3); // initial + 2 retries
  } finally {
    mock.restore();
  }
});

test("request() aborts and reports a timeout when the request hangs", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((_url: unknown, init: unknown) =>
    new Promise((_resolve, reject) => {
      const signal = (init as RequestInit).signal as AbortSignal;
      signal.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    })) as typeof fetch;
  try {
    const client = makeClient({ timeoutMs: 10, maxRetries: 0 });
    await assert.rejects(() => client.topRequests({ phrase: "x" }), /превысил таймаут 10 мс/);
  } finally {
    globalThis.fetch = original;
  }
});

test("request() rejects an absolute path (SSRF) and never fetches a foreign origin", async () => {
  for (const evil of ["https://evil.example/steal", "http://evil.example/x", "\\\\evil.example/x"]) {
    const mock = mockFetch(() => new Response("{}", { status: 200 }));
    try {
      await assert.rejects(() => makeClient().request("POST", evil, {}), /чужой origin/);
      assert.equal(mock.calls.length, 0, `must not fetch for ${JSON.stringify(evil)}`);
    } finally {
      mock.restore();
    }
  }
});

test("request() still accepts a relative API path", async () => {
  const mock = mockFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  try {
    const result = await makeClient().request("POST", "v2/wordstat/topRequests", {});
    assert.deepEqual(result, { ok: true });
    assert.equal(mock.calls[0].url, `${BASE}/v2/wordstat/topRequests`);
  } finally {
    mock.restore();
  }
});

// --- Missing credentials (degraded start) ---

// The exact startup-era texts, relayed verbatim at call time — pinned so a
// reworded message does not silently change what the model tells the user.
const MISSING_TOKEN_TEXT = "Требуется WORDSTAT_API_KEY (API-ключ Yandex Cloud Search API).";
const MISSING_FOLDER_TEXT = "Требуется WORDSTAT_FOLDER_ID (id каталога Yandex Cloud).";

/** Asserts the rejection is a CredentialsError carrying `expected` verbatim. */
function credentialsErrorWith(expected: string): (err: unknown) => boolean {
  return (err: unknown) => {
    assert.ok(err instanceof CredentialsError, "must be a CredentialsError");
    assert.equal((err as Error).name, "CredentialsError");
    assert.ok(
      (err as Error).message.includes(expected),
      `message must carry the exact text, got: ${(err as Error).message}`,
    );
    return true;
  };
}

test("request() without an api key throws CredentialsError; fetch is never called", async () => {
  const mock = mockFetch(() => new Response("{}", { status: 200 }));
  try {
    const client = new WordstatClient({ folderId: "fld-1", apiBase: BASE, lang: "ru" });
    await assert.rejects(() => client.topRequests({ phrase: "x" }), credentialsErrorWith(MISSING_TOKEN_TEXT));
    // Not transport trouble: the retry/backoff branch — and fetch itself —
    // must never run for a configuration problem.
    assert.equal(mock.calls.length, 0, "fetch must not be called without credentials");
  } finally {
    mock.restore();
  }
});

test("request() without a folder id throws CredentialsError; fetch is never called", async () => {
  const mock = mockFetch(() => new Response("{}", { status: 200 }));
  try {
    const client = new WordstatClient({ token: "T", apiBase: BASE, lang: "ru" });
    await assert.rejects(() => client.topRequests({ phrase: "x" }), credentialsErrorWith(MISSING_FOLDER_TEXT));
    assert.equal(mock.calls.length, 0, "fetch must not be called without credentials");
  } finally {
    mock.restore();
  }
});

test("request() with neither credential names both variables in one message", async () => {
  const mock = mockFetch(() => new Response("{}", { status: 200 }));
  try {
    const client = new WordstatClient({ apiBase: BASE, lang: "ru" });
    await assert.rejects(
      () => client.topRequests({ phrase: "x" }),
      (err: unknown) => {
        assert.ok(err instanceof CredentialsError, "must be a CredentialsError");
        const message = (err as Error).message;
        assert.match(message, /WORDSTAT_API_KEY/);
        assert.match(message, /WORDSTAT_FOLDER_ID/);
        return true;
      },
    );
    assert.equal(mock.calls.length, 0, "fetch must not be called without credentials");
  } finally {
    mock.restore();
  }
});

test("regionsTree caches the static tree across calls (fetched once)", async () => {
  let calls = 0;
  const mock = mockFetch(() => {
    calls++;
    return new Response(JSON.stringify({ tree: [] }), { status: 200 });
  });
  try {
    const client = makeClient();
    const a = await client.regionsTree();
    const b = await client.regionsTree();
    assert.deepEqual(a, { tree: [] });
    assert.deepEqual(b, { tree: [] });
    assert.equal(calls, 1); // second call served from cache
  } finally {
    mock.restore();
  }
});

test("regionsTree does not cache a failed fetch", async () => {
  let calls = 0;
  const mock = mockFetch(() => {
    calls++;
    if (calls === 1) return new Response("boom", { status: 500 });
    return new Response(JSON.stringify({ tree: [1] }), { status: 200 });
  });
  try {
    const client = makeClient({ maxRetries: 0 });
    await assert.rejects(() => client.regionsTree(), /HTTP 500/);
    const ok = await client.regionsTree();
    assert.deepEqual(ok, { tree: [1] });
    assert.equal(calls, 2); // failure was not cached, so it refetched
  } finally {
    mock.restore();
  }
});
