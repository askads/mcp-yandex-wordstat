import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/** Normalized device buckets accepted by every tool; the client maps to the API's wire values. */
export const deviceEnum = z.enum(["all", "desktop", "phone", "tablet"]);

/**
 * An RFC3339 timestamp, e.g. 2026-01-01T00:00:00Z — the shape the dynamics report
 * accepts for fromDate/toDate.
 *
 * A FACTORY (not a shared const): reusing one zod object across two fields makes
 * zod-to-json-schema dedupe them into a `$ref` (e.g. toDate → #/properties/fromDate),
 * which some tool-schema consumers (OpenAI Apps review) don't dereference and flag
 * as `any`. A fresh object per field keeps each one inlined with its type + pattern.
 */
export const rfc3339Date = () =>
  z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
      "Должна быть метка времени RFC3339, например 2026-01-01T00:00:00Z",
    );

/** Wraps a value as a compact-JSON tool result (compact: the consumer is an LLM). */
export function ok(data: unknown): CallToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return { content: [{ type: "text", text: text ?? "null" }] };
}

export function fail(err: unknown): CallToolResult {
  let message = err instanceof Error ? err.message : String(err);
  // Surface the underlying cause (e.g. the network error behind a timeout) — no
  // secrets live in cause, and it makes failures far easier to diagnose.
  if (err instanceof Error && err.cause instanceof Error) message += ` (${err.cause.message})`;
  return { content: [{ type: "text", text: `Ошибка: ${message}` }], isError: true };
}

/**
 * MCP tool annotations — hints the consuming client can use to gate or label a
 * tool. Every tool here reads the remote Wordstat API (which has no write
 * endpoints), so READ_ONLY covers all of them.
 */
// All four hints set explicitly: some clients (OpenAI Apps review) require readOnlyHint,
// destructiveHint and openWorldHint on every tool. Read-only tools never mutate, so they
// are non-destructive and idempotent (re-reading yields the same result).
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
