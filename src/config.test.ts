import { test } from "node:test";
import assert from "node:assert/strict";

import { ConfigError, loadConfig } from "./config.js";

/**
 * The reason codes below are the vocabulary the dashboard groups by — renaming
 * one silently splits a bar in two, so they are pinned here.
 */
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

function reasonOf(vars: Record<string, string | undefined>): string {
  let caught: unknown;
  withEnv(vars, () => {
    try {
      loadConfig();
    } catch (err) {
      caught = err;
    }
  });
  assert.ok(caught instanceof ConfigError, "config problems must throw ConfigError, not exit");
  return caught.reason;
}

test("a missing api key reports missing_token", () => {
  assert.equal(
    reasonOf({ WORDSTAT_API_KEY: undefined, WORDSTAT_FOLDER_ID: "folder" }),
    "missing_token",
  );
});

test("a missing folder id is its own reason", () => {
  // Wordstat needs two variables; the folder id is the one people forget.
  assert.equal(
    reasonOf({ WORDSTAT_API_KEY: "key", WORDSTAT_FOLDER_ID: undefined }),
    "missing_folder_id",
  );
});

test("a fully configured server loads without throwing", () => {
  withEnv({ WORDSTAT_API_KEY: "key", WORDSTAT_FOLDER_ID: "folder" }, () => {
    assert.equal(loadConfig().folderId, "folder");
  });
});
