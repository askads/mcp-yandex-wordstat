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
        'Escape hatch to call any Yandex Cloud Search API Wordstat path directly, for endpoints without a dedicated tool, e.g. "v2/wordstat/topRequests". `body` is sent as JSON (folderId is injected automatically). Method defaults to POST.',
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe('API path, e.g. "v2/wordstat/dynamics".'),
        method: z.enum(["GET", "POST"]).optional().describe("HTTP method. Default POST."),
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
