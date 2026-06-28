/**
 * Which Wordstat API the server talks to. The two share concepts (top/related
 * queries, dynamics, regional distribution) but differ in host, auth scheme and
 * request/response field names — the client hides those differences.
 *
 *   "cloud" — Yandex Cloud Search API v2 (https://searchapi.api.cloud.yandex.net,
 *             POST /v2/wordstat/*). Auth: `Api-Key`. Needs a folderId in every
 *             body. Self-serve: key from Yandex Cloud / AI Studio.
 *   "oauth" — api.wordstat.yandex.net (POST /v1/*). Auth: `Bearer` OAuth token.
 *             Access is granted by a manual request to Yandex Direct support.
 */
export type WordstatFlavor = "cloud" | "oauth";

/** Device buckets, normalized; mapped to each flavor's wire values by the client. */
export type Device = "all" | "desktop" | "phone" | "tablet";

/** Dynamics granularity, normalized; mapped per flavor by the client. */
export type Period = "daily" | "weekly" | "monthly";

/** Regional-distribution grouping, normalized; mapped per flavor by the client. */
export type RegionMode = "all" | "cities" | "regions";

export interface WordstatConfig {
  flavor: WordstatFlavor;
  /** Api-Key (cloud) or OAuth token (oauth). Treated as a secret. */
  token: string;
  /** Yandex Cloud folder id, injected into every cloud request body. Cloud only. */
  folderId?: string;
  /** API root host. Defaults per flavor. */
  apiBase: string;
  /** Accept-Language header sent with every request. */
  lang: string;
  /** Per-request timeout in milliseconds. Defaults to 60_000. */
  timeoutMs?: number;
  /** Max retries for transient errors (429 rate limit, 5xx). Defaults to 3. */
  maxRetries?: number;
  /** Base backoff in milliseconds, doubled each retry. Defaults to 500. */
  retryBaseMs?: number;
}

/**
 * Both Wordstat flavors report failures as a non-2xx HTTP status with a JSON
 * body — Cloud uses { code, message, details }, the OAuth API uses
 * { code, message } or { error, error_description }. The parsed body is kept
 * alongside the status and a short readable message is derived.
 */
export class WordstatError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(status: number, body: unknown) {
    super(`HTTP ${status}: ${formatErrorBody(body)}`);
    this.name = "WordstatError";
    this.status = status;
    this.body = body;
  }
}

/** Turns a parsed Wordstat/Cloud error body into a short, readable message. */
function formatErrorBody(body: unknown): string {
  if (body == null) return "(no body)";
  if (typeof body === "string") return body.slice(0, 500);
  if (typeof body !== "object") return String(body);
  const obj = body as Record<string, unknown>;

  // OAuth style: { error: "...", error_description: "..." }
  if (typeof obj.error === "string") {
    const desc = typeof obj.error_description === "string" ? `: ${obj.error_description}` : "";
    return `${obj.error}${desc}`.slice(0, 500);
  }

  // Cloud / Wordstat style: { code, message, details }
  if (typeof obj.message === "string") {
    const code = obj.code !== undefined ? `[${String(obj.code)}] ` : "";
    return `${code}${obj.message}`.slice(0, 500);
  }

  return JSON.stringify(obj).slice(0, 500);
}
