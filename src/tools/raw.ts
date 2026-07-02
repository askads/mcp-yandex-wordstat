import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HttpMethod, WordstatClient } from "../client.js";
import { fail, ok, READ_ONLY } from "./util.js";

export function registerRawTool(server: McpServer, client: WordstatClient): void {
  server.registerTool(
    "raw_request",
    {
      title: "Raw Wordstat API call",
      // The Wordstat API is read-only (no write endpoints), so this stays a read hint.
      annotations: READ_ONLY,
      description:
        'Escape hatch to call any Yandex Cloud Search API Wordstat path directly, for endpoints without a dedicated tool, e.g. "v2/wordstat/topRequests". Every Wordstat endpoint is POST; `body` is sent as JSON (folderId is injected automatically).',
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe('API path, e.g. "v2/wordstat/dynamics".'),
        method: z.enum(["POST"]).optional().describe("HTTP method. Only POST is supported; defaults to POST."),
        body: z.record(z.any()).optional().describe("JSON request body."),
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
