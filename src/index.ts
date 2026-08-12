#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WordstatClient } from "./client.js";
import { ConfigError, loadConfig } from "./config.js";
import { instrumentToolCalls, Telemetry } from "./telemetry.js";
import type { WordstatConfig } from "./types.js";
import { registerWordstatTools } from "./tools/wordstat.js";
import { registerRawTool } from "./tools/raw.js";

/**
 * Prose handed to the calling model in the MCP `initialize` result, before it
 * picks a tool. Deliberately NOT a summary of the tool list (the model already
 * has every name, description and schema): only what the tool list cannot say —
 * which product this is, what the API refuses to do, what a naive call pattern
 * costs, and which failures mean something other than what they look like.
 * It is prepended to every session, so keep it dense and factual.
 */
const INSTRUCTIONS =
  "Yandex Wordstat is aggregated search-demand statistics from Yandex search: how often a phrase is " +
  "typed, when and where. It is not Yandex Direct — no campaigns, ads, bids, clicks or spend, and " +
  "the data is tied to no advertising account. Everything is read-only: the API has no write " +
  "endpoints, and raw_request is POST-only and cannot leave the Search API host. One call covers " +
  "one phrase, so comparing N keywords costs N calls against the Yandex Cloud Search API quota — " +
  "counted per key and shared across every call: don't sweep a keyword list blindly, and reuse what " +
  "you fetched. The region tree is cached in-process, so re-reading it is free. Only dynamics takes " +
  "a date range; top_requests and regions are fixed to the last 30 days. Counts are int64 and often " +
  "arrive as JSON strings — convert before sorting or summing. 429/5xx and network errors are " +
  "already retried with backoff inside the server, so re-issuing the same call after one will not " +
  "help. 401/403 means the key lacks the Search API scope or WORDSTAT_FOLDER_ID names the wrong " +
  "folder — an operator fix, not a bad phrase.";

/** Reads the package version so the server reports its real version to MCP clients. */
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Loads the config, reporting the drop-off if it is missing. An unconfigured
 * server dies before the MCP handshake, so this ping is the only trace such an
 * install ever leaves — and it has to be awaited, or process.exit() below would
 * kill the request in flight.
 */
async function loadConfigOrExit(telemetry: Telemetry): Promise<WordstatConfig> {
  try {
    return loadConfig();
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(`Error: ${err.message}`);
    await telemetry.sendBlocking("startup_failed", { reason: err.reason });
    process.exit(1);
  }
}

async function main(): Promise<void> {
  // Anonymous usage pings (ids/names/versions only, never data or arguments);
  // opt out with ASKADS_TELEMETRY=0. Built before the config so a missing key
  // can be reported; wired to the server before tools register.
  const telemetry = new Telemetry(readVersion());
  const config = await loadConfigOrExit(telemetry);
  const client = new WordstatClient(config);

  // `instructions` rides in the server options (second argument) and surfaces as
  // the top-level `instructions` of the initialize result.
  const server = new McpServer(
    {
      name: "mcp-yandex-wordstat",
      version: readVersion(),
    },
    { instructions: INSTRUCTIONS },
  );

  instrumentToolCalls(server, telemetry);
  server.server.oninitialized = () => {
    telemetry.setClientInfo(server.server.getClientVersion());
    telemetry.send("server_start");
  };

  registerWordstatTools(server, client);
  registerRawTool(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-yandex-wordstat running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-yandex-wordstat:", err);
  process.exit(1);
});
