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
        'Escape hatch to call any Wordstat API path directly, for endpoints without a dedicated tool. Pass the flavor-specific path — cloud: "v2/wordstat/topRequests"; oauth: "v1/topRequests" / "v1/getRegionsTree". `body` is sent as JSON (folderId is injected automatically on the cloud flavor). Default method POST; use GET only for the oauth getRegionsTree.',
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe('API path, e.g. "v2/wordstat/dynamics" (cloud) or "v1/regions" (oauth).'),
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
