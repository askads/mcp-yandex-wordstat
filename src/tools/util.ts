import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/** Normalized device buckets accepted by every tool; the client maps to the flavor. */
export const deviceEnum = z.enum(["all", "desktop", "phone", "tablet"]);

/** Wraps a value as a compact-JSON tool result (compact: the consumer is an LLM). */
export function ok(data: unknown): CallToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return { content: [{ type: "text", text: text ?? "null" }] };
}

export function fail(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/**
 * MCP tool annotations — hints the consuming client can use to gate or label a
 * tool. Every tool here reads the remote Wordstat API (which has no write
 * endpoints), so READ_ONLY with openWorldHint covers all of them.
 */
export const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;
