import { test } from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "./config.js";

function withEnv(vars: Record<string, string | undefined>, run: () => void): void {
  const saved = new Map(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    run();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/**
 * Missing credentials used to throw, which killed the process before the MCP
 * handshake and left the user with a silent red cross. It is now a survivable
 * state: the server starts, answers initialize/tools/list, and the client
 * raises CredentialsError at call time (pinned in client.test.ts). Pinned here
 * because reverting it would restore that dead end.
 */
test("a missing api key does not throw — the server must start degraded", () => {
  withEnv({ WORDSTAT_API_KEY: undefined, WORDSTAT_FOLDER_ID: "folder" }, () => {
    const config = loadConfig();
    assert.equal(config.token, undefined);
    assert.equal(config.folderId, "folder");
  });
});

test("a missing folder id does not throw either", () => {
  withEnv({ WORDSTAT_API_KEY: "key", WORDSTAT_FOLDER_ID: undefined }, () => {
    const config = loadConfig();
    assert.equal(config.token, "key");
    assert.equal(config.folderId, undefined);
  });
});

test("with neither variable the config still loads, with defaults intact", () => {
  withEnv(
    { WORDSTAT_API_KEY: undefined, WORDSTAT_FOLDER_ID: undefined, WORDSTAT_API_BASE: undefined },
    () => {
      const config = loadConfig();
      assert.equal(config.token, undefined);
      assert.equal(config.folderId, undefined);
      assert.equal(config.apiBase, "https://searchapi.api.cloud.yandex.net");
    },
  );
});

test("an empty value is treated as absent, not as an empty credential", () => {
  withEnv({ WORDSTAT_API_KEY: "", WORDSTAT_FOLDER_ID: "" }, () => {
    const config = loadConfig();
    assert.equal(config.token, undefined);
    assert.equal(config.folderId, undefined);
  });
});

test("a fully configured server loads without throwing", () => {
  withEnv({ WORDSTAT_API_KEY: "key", WORDSTAT_FOLDER_ID: "folder" }, () => {
    const config = loadConfig();
    assert.equal(config.token, "key");
    assert.equal(config.folderId, "folder");
  });
});
