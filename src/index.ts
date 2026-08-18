#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WordstatClient } from "./client.js";
import { ConfigError, DEFAULT_API_BASE, loadConfig } from "./config.js";
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

/**
 * Prepended to INSTRUCTIONS when a credential is missing. The model reads this
 * before it picks a tool, so an unconfigured session opens with the fix rather
 * than with a failed call. Unlike the Metrica sibling there is no in-chat
 * login: the key comes only from the environment, so the fix is the operator's —
 * set the variables and restart the server.
 */
const UNCONFIGURED_PREFIX =
  "ВНИМАНИЕ: Яндекс Вордстат ещё не настроен — не заданы переменные окружения WORDSTAT_API_KEY " +
  "и/или WORDSTAT_FOLDER_ID, поэтому любой вызов инструмента вернёт ошибку. Подключиться из " +
  "диалога нельзя: оператор должен задать WORDSTAT_API_KEY (API-ключ Yandex Cloud Search API — " +
  "тот же тип ключа, что для YandexGPT; выдаётся сервисному аккаунту с ролью " +
  "search-api.webSearch.user) и WORDSTAT_FOLDER_ID (id каталога из консоли Yandex Cloud) в " +
  "конфигурации MCP-клиента и перезапустить сервер. ";

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
 * Loads the config without dying on a bad value. A server that exits here never
 * completes the MCP handshake, so the user sees a red cross and no reason —
 * instead the problem is carried into the session, where the model can read it
 * and relay it. (Missing credentials are not an error at all — loadConfig
 * leaves the fields undefined; today it has no malformed-value checks either,
 * so the catch guards future ones.)
 */
function loadConfigOrDegraded(telemetry: Telemetry): {
  config: WordstatConfig;
  problem?: ConfigError;
} {
  try {
    return { config: loadConfig() };
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(`Ошибка конфигурации: ${err.message}`);
    // Fire-and-forget now that the process survives: the historical
    // `startup_failed` funnel stays comparable, but nothing blocks startup.
    telemetry.send("startup_failed", { reason: err.reason });
    return {
      config: {
        apiBase: process.env.WORDSTAT_API_BASE || DEFAULT_API_BASE,
        lang: process.env.WORDSTAT_LANG || "ru",
      },
      problem: err,
    };
  }
}

async function main(): Promise<void> {
  // Anonymous usage pings (ids/names/versions only, never data or arguments);
  // opt out with ASKADS_TELEMETRY=0. Built before the config so a config
  // problem can be reported; wired to the server before tools register.
  const telemetry = new Telemetry(readVersion());
  const { config, problem } = loadConfigOrDegraded(telemetry);
  const client = new WordstatClient(config);

  // Credentials come only from the environment, so this cannot change
  // mid-session: an unconfigured start stays unconfigured until the operator
  // sets the variables and restarts the server.
  const connected = Boolean(config.token && config.folderId);

  // `instructions` rides in the server options (second argument) and surfaces as
  // the top-level `instructions` of the initialize result.
  const server = new McpServer(
    {
      name: "mcp-yandex-wordstat",
      version: readVersion(),
    },
    {
      instructions: connected
        ? INSTRUCTIONS
        : UNCONFIGURED_PREFIX + (problem ? `Проблема конфигурации: ${problem.message} ` : "") + INSTRUCTIONS,
    },
  );

  instrumentToolCalls(server, telemetry);
  server.server.oninitialized = () => {
    telemetry.setClientInfo(server.server.getClientVersion());
    // Split on purpose: `server_start` keeps meaning "a usable install started",
    // so the unconfigured case gets its own event instead of inflating that
    // number. The reason vocabulary is the historical closed set — with both
    // variables absent it stays missing_token, matching the old check order.
    if (connected) telemetry.send("server_start");
    else {
      telemetry.send("unconfigured_start", {
        reason: problem?.reason ?? (!config.token ? "missing_token" : "missing_folder_id"),
      });
    }
  };

  registerWordstatTools(server, client);
  registerRawTool(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `mcp-yandex-wordstat работает на stdio${
      connected ? "" : " (не заданы WORDSTAT_API_KEY/WORDSTAT_FOLDER_ID — задайте переменные и перезапустите сервер)"
    }`,
  );
}

main().catch((err) => {
  console.error("Критическая ошибка при запуске mcp-yandex-wordstat:", err);
  process.exit(1);
});
