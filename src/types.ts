/**
 * The server talks to the Yandex Cloud Search API v2 Wordstat endpoints
 * (https://searchapi.api.cloud.yandex.net, POST /v2/wordstat/*). Auth is an
 * `Api-Key` and every request body carries a folderId.
 *
 * Note: the legacy standalone API (api.wordstat.yandex.net, OAuth/Bearer) is no
 * longer offered — Yandex folded that functionality into the Search API (this
 * backend). See the README.
 */

/** Device buckets, normalized; mapped to the API's wire values by the client. */
export type Device = "all" | "desktop" | "phone" | "tablet";

/** Dynamics granularity, normalized; mapped by the client. */
export type Period = "daily" | "weekly" | "monthly";

/** Regional-distribution grouping, normalized; mapped by the client. */
export type RegionMode = "all" | "cities" | "regions";

export interface WordstatConfig {
  /** Yandex Cloud API key (Search API), sent as `Api-Key`. Treated as a secret. */
  token: string;
  /** Yandex Cloud folder id, injected into every request body. */
  folderId: string;
  /** API root host. Defaults to the Yandex Cloud Search API. */
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
 * The Search API reports failures as a non-2xx HTTP status with a JSON body
 * ({ code, message, details }). The parsed body is kept alongside the status
 * and a short readable message is derived.
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

/** Turns a parsed Search API error body into a short, readable message. */
function formatErrorBody(body: unknown): string {
  if (body == null) return "(no body)";
  if (typeof body === "string") return body.slice(0, 500);
  if (typeof body !== "object") return String(body);
  const obj = body as Record<string, unknown>;

  // Search API style: { code, message, details }
  if (typeof obj.message === "string") {
    const code = obj.code !== undefined ? `[${String(obj.code)}] ` : "";
    return `${code}${obj.message}`.slice(0, 500);
  }

  return JSON.stringify(obj).slice(0, 500);
}
