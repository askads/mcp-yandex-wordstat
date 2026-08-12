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
  "Яндекс Вордстат — агрегированная статистика поискового спроса в поиске Яндекса: как часто фразу " +
  "набирают, когда и где. Это не Яндекс Директ: кампаний, объявлений, ставок, кликов и расхода тут " +
  "нет, а данные не привязаны ни к какому рекламному аккаунту. Всё только на чтение: у API нет " +
  "эндпоинтов записи, а raw_request работает только методом POST и не может уйти с хоста Search " +
  "API. Один вызов — одна фраза, поэтому сравнение N ключевых фраз стоит N вызовов из квоты Yandex " +
  "Cloud Search API — она считается на ключ и общая для всех вызовов: не стоит вслепую прогонять " +
  "весь список ключевых фраз, а уже полученное лучше переиспользовать. Дерево регионов кешируется " +
  "в процессе, поэтому перечитывать его бесплатно. Диапазон дат принимает только dynamics; " +
  "top_requests и regions всегда считают последние 30 дней. Значения count — int64 и часто " +
  "приходят JSON-строками: перед сортировкой или суммированием их нужно привести к числу. 429, " +
  "5xx и сетевые ошибки сервер уже повторяет с нарастающими паузами, поэтому повторять тот же " +
  "вызов после них бесполезно. 401/403 означает, что у ключа нет доступа к Search API или " +
  "WORDSTAT_FOLDER_ID указывает не на тот каталог, — это чинит оператор, дело не в фразе.";

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
    console.error(`Ошибка: ${err.message}`);
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
  console.error("mcp-yandex-wordstat работает на stdio");
}

main().catch((err) => {
  console.error("Критическая ошибка при запуске mcp-yandex-wordstat:", err);
  process.exit(1);
});
