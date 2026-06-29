#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WordstatClient } from "./client.js";
import { loadConfig } from "./config.js";
import { registerWordstatTools } from "./tools/wordstat.js";
import { registerRawTool } from "./tools/raw.js";

/** Reads the package version so the server reports its real version to MCP clients. */
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new WordstatClient(config);

  const server = new McpServer({
    name: "mcp-yandex-wordstat",
    version: readVersion(),
  });

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
