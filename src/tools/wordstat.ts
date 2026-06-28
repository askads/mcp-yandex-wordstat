import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WordstatClient } from "../client.js";
import { deviceEnum, fail, ok, READ_ONLY } from "./util.js";

/** Region ids accept numbers or numeric strings; the client coerces per flavor. */
const regionIds = z
  .array(z.union([z.number().int(), z.string()]))
  .optional()
  .describe("Region ids to scope demand to, e.g. [213] (Moscow), [2] (St. Petersburg). Get ids from list_regions. Omit for all regions.");

const devices = z
  .array(deviceEnum)
  .optional()
  .describe("Device filter: any of all, desktop, phone, tablet. Omit for all devices.");

export function registerWordstatTools(server: McpServer, client: WordstatClient): void {
  server.registerTool(
    "top_requests",
    {
      title: "Top & related queries",
      annotations: READ_ONLY,
      description:
        "Returns search-demand for a phrase over the last 30 days: the most popular queries that CONTAIN the phrase (results/topRequests) and semantically RELATED queries that may not contain it (associations), plus totalCount. Use it to discover keywords and gauge demand. Counts can arrive as strings (int64). Optional regionIds and devices narrow the result; numPhrases (cloud flavor) sets how many to return (1..2000).",
      inputSchema: {
        phrase: z.string().min(1).describe("The search phrase to research, e.g. «купить велосипед»."),
        regionIds,
        devices,
        numPhrases: z
          .number()
          .int()
          .min(1)
          .max(2000)
          .optional()
          .describe("How many top phrases to return (cloud flavor only; default 20). Ignored on the oauth flavor."),
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
      title: "Demand dynamics over time",
      annotations: READ_ONLY,
      description:
        "Returns how demand for a phrase changed over time — a series of {date, count, share}, where share is the fraction of all Yandex searches. Use it for seasonality and trend. period sets the granularity (daily/weekly/monthly). fromDate/toDate bound the range — on the cloud flavor they are RFC3339 timestamps and toDate must align to the period boundary; on the oauth flavor they are YYYY-MM-DD.",
      inputSchema: {
        phrase: z.string().min(1).describe("The search phrase to research."),
        period: z
          .enum(["daily", "weekly", "monthly"])
          .optional()
          .describe("Granularity of the series. Default monthly."),
        fromDate: z.string().optional().describe("Range start. cloud: RFC3339; oauth: YYYY-MM-DD."),
        toDate: z.string().optional().describe("Range end (aligned to the period). cloud: RFC3339; oauth: YYYY-MM-DD."),
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
      title: "Regional distribution",
      annotations: READ_ONLY,
      description:
        "Returns how demand for a phrase is distributed across regions over the last 30 days. Each row has the region id, count, share and affinityIndex (>100% = above-average interest in that region, <100% = below). regionMode chooses the grouping: all, cities (only cities) or regions (only oblasts/subjects). Map region ids to names with list_regions.",
      inputSchema: {
        phrase: z.string().min(1).describe("The search phrase to research."),
        regionMode: z
          .enum(["all", "cities", "regions"])
          .optional()
          .describe("Grouping: all (default), cities (only cities), or regions (only subjects/oblasts)."),
        devices,
      },
    },
    async ({ phrase, regionMode, devices }) => {
      try {
        return ok(await client.regions({ phrase, regionMode, devices }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "list_regions",
    {
      title: "Region reference tree",
      annotations: READ_ONLY,
      description:
        "Returns the reference tree of regions Wordstat supports — region ids and their names (label). The ids feed the regionIds/regionMode of the other tools, and the names decode region ids in their responses. The tree is large and stable; fetch it once and cache it.",
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
