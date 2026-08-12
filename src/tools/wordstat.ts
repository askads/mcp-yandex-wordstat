import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WordstatClient } from "../client.js";
import { deviceEnum, fail, ok, READ_ONLY, rfc3339Date } from "./util.js";

/** Region ids accept numbers or numeric strings; the client coerces them for the API. */
const regionIds = z
  .array(z.union([z.number().int(), z.string().regex(/^\d+$/, "id региона должен быть числом")]))
  .optional()
  .describe("Id регионов, которыми ограничить спрос, например [213] (Москва), [2] (Санкт-Петербург). Id берутся из list_regions. Без параметра — все регионы.");

const devices = z
  .array(deviceEnum)
  .optional()
  .describe("Фильтр по устройствам: любые из all, desktop, phone, tablet. Без параметра — все устройства.");

export function registerWordstatTools(server: McpServer, client: WordstatClient): void {
  server.registerTool(
    "top_requests",
    {
      title: "Топ и похожие запросы",
      annotations: READ_ONLY,
      description:
        "Возвращает поисковый спрос по фразе за последние 30 дней: самые популярные запросы, которые СОДЕРЖАТ фразу (results), и семантически ПОХОЖИЕ запросы, которые могут её не содержать (associations), плюс totalCount. Подходит для подбора ключевых фраз и оценки спроса. Значения счётчиков могут приходить строками (int64). Необязательные regionIds и devices сужают выборку; numPhrases задаёт, сколько фраз вернуть (1..2000).",
      inputSchema: {
        phrase: z.string().min(1).describe("Поисковая фраза для анализа, например «купить велосипед»."),
        regionIds,
        devices,
        numPhrases: z
          .number()
          .int()
          .min(1)
          .max(2000)
          .optional()
          .describe("Сколько топовых фраз вернуть (1..2000; по умолчанию 20)."),
      },
    },
    async ({ phrase, regionIds, devices, numPhrases }) => {
      try {
        return ok(await client.topRequests({ phrase, regionIds, devices, numPhrases }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "dynamics",
    {
      title: "Динамика спроса во времени",
      annotations: READ_ONLY,
      description:
        "Возвращает, как менялся спрос на фразу во времени, — ряд {date, count, share}, где share — доля от всех поисковых запросов Яндекса. Подходит для оценки сезонности и тренда. period задаёт шаг ряда (daily/weekly/monthly). fromDate/toDate ограничивают диапазон метками времени RFC3339, при этом toDate должен попадать на границу периода.",
      inputSchema: {
        phrase: z.string().min(1).describe("Поисковая фраза для анализа."),
        period: z
          .enum(["daily", "weekly", "monthly"])
          .optional()
          .describe("Шаг ряда. По умолчанию monthly."),
        fromDate: rfc3339Date().optional().describe("Начало диапазона (RFC3339), например 2026-01-01T00:00:00Z."),
        toDate: rfc3339Date().optional().describe("Конец диапазона (RFC3339), выровненный по границе периода."),
        regionIds,
        devices,
      },
    },
    async ({ phrase, period, fromDate, toDate, regionIds, devices }) => {
      try {
        return ok(await client.dynamics({ phrase, period, fromDate, toDate, regionIds, devices }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "regions",
    {
      title: "Распределение по регионам",
      annotations: READ_ONLY,
      description:
        "Возвращает, как спрос на фразу распределён по регионам за последние 30 дней. В каждой строке — id региона, count, share и affinityIndex (>100% — интерес в регионе выше среднего, <100% — ниже). regionMode выбирает группировку: all, cities (только города) или regions (только области и субъекты). Сопоставить id регионов с названиями помогает list_regions.",
      inputSchema: {
        phrase: z.string().min(1).describe("Поисковая фраза для анализа."),
        regionMode: z
          .enum(["all", "cities", "regions"])
          .optional()
          .describe("Группировка: all (по умолчанию), cities (только города) или regions (только субъекты и области)."),
      },
    },
    async ({ phrase, regionMode }) => {
      try {
        return ok(await client.regions({ phrase, regionMode }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "list_regions",
    {
      title: "Справочное дерево регионов",
      annotations: READ_ONLY,
      description:
        "Возвращает справочное дерево регионов, которые поддерживает Вордстат, — id регионов и их названия (label). Эти id подставляются в regionIds/regionMode остальных инструментов, а названия расшифровывают id регионов в их ответах. Дерево большое и стабильное: достаточно запросить его один раз и закешировать.",
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await client.regionsTree());
      } catch (e) {
        return fail(e);
      }
    },
  );
}
