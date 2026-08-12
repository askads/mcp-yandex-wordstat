import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HttpMethod, WordstatClient } from "../client.js";
import { fail, ok, READ_ONLY } from "./util.js";

export function registerRawTool(server: McpServer, client: WordstatClient): void {
  server.registerTool(
    "raw_request",
    {
      title: "Прямой вызов API Вордстата",
      // The Wordstat API is read-only (no write endpoints), so this stays a read hint.
      annotations: READ_ONLY,
      description:
        'Универсальный запрос: обращается напрямую к любому пути Wordstat в Yandex Cloud Search API — для эндпоинтов, у которых нет отдельного инструмента, например "v2/wordstat/topRequests". Все эндпоинты Вордстата работают методом POST; `body` отправляется как JSON (folderId подставляется автоматически).',
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe('Путь API, например "v2/wordstat/dynamics".'),
        method: z.enum(["POST"]).optional().describe("HTTP-метод. Поддерживается только POST, он же по умолчанию."),
        body: z.record(z.any()).optional().describe("Тело запроса в формате JSON."),
      },
    },
    async ({ path, method, body }) => {
      try {
        const m = (method ?? "POST") as HttpMethod;
        return ok(await client.request(m, path, body));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
