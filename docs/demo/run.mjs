#!/usr/bin/env node
// Демо-клиент для README-GIF: поднимает НАСТОЯЩИЙ сервер (dist/index.js) по stdio,
// делает настоящий MCP-хендшейк и настоящие tools/call через официальный SDK.
// Единственная подмена — ответы Yandex Cloud Search API (Wordstat) законсервированы
// в docs/demo/mock-api.mjs (NODE_OPTIONS=--import), поэтому демо воспроизводится
// без ключа и без сети. Запись GIF: vhs docs/demo.tape (см. docs/demo.tape).

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const mockPath = path.join(repoRoot, "docs", "demo", "mock-api.mjs");

// ---------- оформление ----------
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const MAUVE = "\x1b[35m";
const WIDTH = 92;

const out = process.stdout;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function typeOut(text, msPerChar) {
  for (const ch of text) {
    out.write(ch);
    await sleep(msPerChar);
  }
}

async function spinner(ms, label) {
  const frames = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
  const started = Date.now();
  let i = 0;
  while (Date.now() - started < ms) {
    out.write(`\r\x1b[2K  ${DIM}${frames[i++ % frames.length]} ${label}${RESET}`);
    await sleep(80);
  }
  out.write("\r\x1b[2K");
}

async function printResultLines(lines) {
  for (let i = 0; i < lines.length; i++) {
    out.write((i === 0 ? "  ⎿ " : "    ") + lines[i] + "\n");
    await sleep(60);
  }
}

// ---------- сценарий ----------
const QUESTION = "Сколько ищут „купить велосипед“, какая сезонность и в каких городах спрос выше?";

// Финальный вывод «ассистента»: строки из сегментов [стиль, текст].
const ANSWER = [
  [[BOLD, "«Купить велосипед» ищут ~600 тыс. раз в месяц (598 420 за 30 дней) — сезон в разгаре."]],
  [],
  [
    ["", "  • "],
    [CYAN + BOLD, "Сезонность"],
    ["", " — пик апрель–июнь: май 611 580 запросов против 141 050 в январе (перепад"],
  ],
  [["", "    в 4,3 раза). Основной бюджет — на апрель–июнь, разгон кампании — уже с марта."]],
  [
    ["", "  • "],
    [GREEN + BOLD, "Города-лидеры"],
    ["", " — Петербург (индекс 148%), Екатеринбург (133%), Новосибирск (121%):"],
  ],
  [["", "    здесь стоит поднять ставки. Москва даёт максимум объёма, но индекс ниже среднего."]],
];

// Топ-запросы и похожие — двумя колонками; счётчики сервер отдаёт строками (int64).
function renderTop(text) {
  const data = JSON.parse(text);
  const res = data.results.slice(0, 3);
  const asc = data.associations.slice(0, 3);
  const table = [
    ["results", "count", "associations", "count"],
    ...res.map((r, i) => [r.phrase, r.count, asc[i]?.phrase ?? "", asc[i]?.count ?? ""]),
  ];
  const w = table[0].map((_, c) => Math.max(...table.map((row) => row[c].length)));
  const fmt = (row) =>
    `${row[0].padEnd(w[0])}  ${row[1].padStart(w[1])}   ${row[2].padEnd(w[2])}  ${row[3].padStart(w[3])}`.trimEnd();
  const summary = `… results ${data.results.length} · associations ${data.associations.length} · totalCount ${data.totalCount} — запросов с фразой за 30 дней`;
  return printResultLines([DIM + fmt(table[0]) + RESET, ...table.slice(1).map(fmt), DIM + summary + RESET]);
}

// 12 месяцев компактной сеткой 4×3: месяц + count (данные тула как есть).
function renderDynamics(text) {
  const cells = JSON.parse(text).results.map(
    (r) => `${r.date.slice(0, 7)} ${String(r.count).padStart(6)}`,
  );
  const lines = [];
  for (let i = 0; i < cells.length; i += 4) lines.push(cells.slice(i, i + 4).join("   "));
  return printResultLines(lines);
}

function renderRegions(text) {
  const table = [
    ["region", "count", "share", "affinityIndex"],
    ...JSON.parse(text).results.map((r) => [r.region, String(r.count), String(r.share), String(r.affinityIndex)]),
  ];
  const w = table[0].map((_, c) => Math.max(...table.map((row) => row[c].length)));
  const fmt = (row) => row.map((cell, c) => (c === 0 ? cell.padEnd(w[c]) : cell.padStart(w[c]))).join("  ").trimEnd();
  const note = "… id → имена: тул list_regions (геобаза Яндекса: 213 = Москва, 2 = Санкт-Петербург)";
  return printResultLines([DIM + fmt(table[0]) + RESET, ...table.slice(1).map(fmt), DIM + note + RESET]);
}

const STEPS = [
  {
    tool: "top_requests",
    args: { phrase: "купить велосипед", numPhrases: 5 },
    spin: 700,
    label: "Wordstat: topRequests",
    render: renderTop,
  },
  {
    tool: "dynamics",
    args: {
      phrase: "купить велосипед",
      period: "monthly",
      fromDate: "2025-07-01T00:00:00Z",
      toDate: "2026-07-01T00:00:00Z",
    },
    spin: 1200,
    label: "Wordstat: dynamics — 12 месяцев",
    render: renderDynamics,
  },
  {
    tool: "regions",
    args: { phrase: "купить велосипед", regionMode: "cities" },
    spin: 900,
    label: "Wordstat: regions",
    render: renderRegions,
  },
];

// ---------- прогон ----------
async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "dist", "index.js")],
    cwd: repoRoot,
    stderr: "ignore",
    env: {
      ...process.env,
      WORDSTAT_API_KEY: "demo",
      WORDSTAT_FOLDER_ID: "b1demo",
      WORDSTAT_API_BASE: "",
      NODE_OPTIONS: `--import ${mockPath}`,
    },
  });
  const client = new Client({ name: "readme-demo", version: "1.0.0" });
  await client.connect(transport);

  const info = client.getServerVersion();
  const { tools } = await client.listTools();
  out.write("\x1b[2J\x1b[H"); // чистый экран: контент обязан уместиться без скролла
  out.write(`${GREEN}●${RESET} ${BOLD}${info.name}${RESET} ${DIM}v${info.version} · stdio · ${tools.length} инструментов${RESET}\n\n`);
  await sleep(900);

  out.write(`${CYAN}${BOLD}❯${RESET} `);
  await sleep(600);
  await typeOut(QUESTION, 42);
  await sleep(700);
  out.write("\n\n");

  for (const step of STEPS) {
    // Аргументы в одну строку: длинный JSON обрезаем, чтобы строка вызова не заворачивалась.
    let argsShown = JSON.stringify(step.args);
    const argsMax = WIDTH - step.tool.length - 3;
    if (argsShown.length > argsMax) argsShown = argsShown.slice(0, argsMax - 2) + "…}";
    out.write(`${GREEN}⏺${RESET} ${BOLD}${step.tool}${RESET} ${DIM}${argsShown}${RESET}\n`);
    const [res] = await Promise.all([
      client.callTool({ name: step.tool, arguments: step.args }),
      spinner(step.spin, step.label),
    ]);
    const text = res.content?.[0]?.text ?? "";
    if (res.isError) {
      out.write(`  ${RED}${text}${RESET}\n`);
      process.exit(1);
    }
    await step.render(text);
    out.write("\n");
    await sleep(400);
  }

  await sleep(500);
  out.write(`${MAUVE}✦${RESET} `);
  for (const line of ANSWER) {
    for (const [style, seg] of line) {
      for (const word of seg.split(/(?<= )/)) {
        out.write(style + word + RESET);
        await sleep(34);
      }
    }
    out.write("\n");
    if (line.length === 0) await sleep(120);
  }

  out.write("\x1b[?25l"); // спрятать курсор — чистый финальный кадр
  await client.close();
  // Держим кадр, пока vhs не закончит запись (короткий hold — для ручного прогона).
  await sleep(Number(process.env.DEMO_HOLD_MS ?? 120_000));
}

main().catch((err) => {
  console.error(`${RED}demo failed:${RESET}`, err);
  process.exit(1);
});
