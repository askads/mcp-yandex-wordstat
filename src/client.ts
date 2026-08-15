import type { Device, Period, RegionMode, WordstatConfig } from "./types.js";
import { CredentialsError, WordstatError } from "./types.js";

export type HttpMethod = "GET" | "POST";

/** Normalized inputs for the top/related-queries report. */
export interface TopRequestsParams {
  phrase: string;
  /** Region ids to scope demand to (e.g. 213 = Moscow). */
  regionIds?: Array<string | number>;
  devices?: Device[];
  /** Max phrases to return (numPhrases 1..2000). */
  numPhrases?: number;
}

/** Normalized inputs for the time-dynamics report. */
export interface DynamicsParams {
  phrase: string;
  period?: Period;
  /** Period start (RFC3339). Passed through. */
  fromDate?: string;
  /** Period end (RFC3339, aligned to the period boundary). Passed through. */
  toDate?: string;
  regionIds?: Array<string | number>;
  devices?: Device[];
}

/** Normalized inputs for the regional-distribution report. */
export interface RegionsParams {
  phrase: string;
  regionMode?: RegionMode;
}

/** Maps a normalized device bucket to the API's wire value. */
function mapDevice(d: Device): string {
  return { all: "DEVICE_ALL", desktop: "DEVICE_DESKTOP", phone: "DEVICE_PHONE", tablet: "DEVICE_TABLET" }[d];
}

/** Maps a normalized period to the API's wire value. */
function mapPeriod(p: Period): string {
  return { daily: "PERIOD_DAILY", weekly: "PERIOD_WEEKLY", monthly: "PERIOD_MONTHLY" }[p];
}

/** Maps a normalized region-distribution mode to the API's wire value. */
function mapRegionMode(m: RegionMode): string {
  return { all: "REGION_ALL", cities: "REGION_CITIES", regions: "REGION_REGIONS" }[m];
}

/**
 * Call-time texts for missing credentials — formerly the startup errors that
 * killed the process before the MCP handshake, preserved verbatim (pinned in
 * client.test.ts). The message is the product: it is what the calling model
 * relays to the user, so it names the variable to set and says the server
 * needs a restart — there is no in-chat login for an API key.
 */
const MISSING_TOKEN_TEXT = "Требуется WORDSTAT_API_KEY (API-ключ Yandex Cloud Search API).";
const MISSING_FOLDER_TEXT = "Требуется WORDSTAT_FOLDER_ID (id каталога Yandex Cloud).";
const MISSING_BOTH_TEXT =
  "Требуются WORDSTAT_API_KEY (API-ключ Yandex Cloud Search API) и WORDSTAT_FOLDER_ID (id каталога Yandex Cloud).";

/** The full CredentialsError message for this config, or undefined when configured. */
function missingCredentialsMessage(config: WordstatConfig): string | undefined {
  const noToken = !config.token;
  const noFolder = !config.folderId;
  if (!noToken && !noFolder) return undefined;
  const what = noToken && noFolder ? MISSING_BOTH_TEXT : noToken ? MISSING_TOKEN_TEXT : MISSING_FOLDER_TEXT;
  const fix =
    " Это не сбой сети — повторный вызов не поможет: задайте " +
    (noToken && noFolder ? "переменные окружения" : "переменную окружения") +
    " в конфигурации MCP-клиента и перезапустите сервер.";
  return what + fix;
}

export class WordstatClient {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  /** Lazy cache for the static region tree (see {@link regionsTree}). */
  private regionsTreeCache?: Promise<unknown>;

  constructor(private readonly config: WordstatConfig) {
    this.base = config.apiBase.endsWith("/") ? config.apiBase : config.apiBase + "/";
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBaseMs = config.retryBaseMs ?? 500;
  }

  private headers(hasBody: boolean): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Api-Key ${this.config.token}`,
      "Accept-Language": this.config.lang,
    };
    if (hasBody) h["Content-Type"] = "application/json";
    return h;
  }

  /** Backoff before a retry: honors Retry-After when present, else exponential (capped at 30s). */
  private backoffMs(attempt: number, res?: Response): number {
    const retryAfter = res ? Number(res.headers.get("Retry-After")) : NaN;
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter, 30) * 1000;
    return Math.min(this.retryBaseMs * 2 ** attempt, 30_000);
  }

  /**
   * fetch with an AbortController timeout. Reads the response body inside the
   * guarded zone so the timeout also covers a slow or drip-feeding body, not just
   * the initial headers, and returns the text alongside the response.
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    label: string,
  ): Promise<{ res: Response; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const text = await res.text();
      return { res, text };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Запрос к "${label}" превысил таймаут ${this.timeoutMs} мс`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Low-level request to a Search API Wordstat path (e.g. "v2/wordstat/topRequests").
   * folderId is injected into the body of every POST when absent. Retries 429, 5xx
   * and network errors/timeouts with backoff; any other non-2xx throws a
   * {@link WordstatError}.
   */
  async request<T = unknown>(method: HttpMethod, path: string, body?: Record<string, unknown>): Promise<T> {
    // A missing credential is rejected before the request is built, retried or
    // sent: it is a configuration problem, not transport trouble, so it must
    // never enter the retry/backoff branch below — and fetch never fires
    // without auth (pinned in client.test.ts).
    const missing = missingCredentialsMessage(this.config);
    if (missing) throw new CredentialsError(missing);

    let payload = body;
    if (method === "POST") {
      payload = { folderId: this.config.folderId, ...(body ?? {}) };
    }
    // Guard method !== "GET" keeps undici from crashing on a GET-with-body.
    const hasBody = payload !== undefined && method !== "GET";

    // Resolve the path against the API base, then reject anything that escaped to a
    // foreign origin (an absolute "https://evil/x" or a "\\evil/x" slipped through
    // raw_request) so the Api-Key header can never leak to another host.
    const url = new URL(path.replace(/^\//, ""), this.base);
    if (url.origin !== new URL(this.base).origin) {
      throw new Error(`path у raw_request должен быть относительным путём API (получился чужой origin ${url.origin})`);
    }
    const target = url.toString();

    // The Wordstat API is read-only: GET has no endpoints and every report is a
    // side-effect-free POST, so all requests are safe to retry. (A write API must
    // gate 5xx/network retries to idempotent methods, or a 502 after the write
    // commits would duplicate it — see the sibling servers.)
    const idempotent = true;

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      let text: string;
      try {
        ({ res, text } = await this.fetchWithTimeout(
          target,
          {
            method,
            headers: this.headers(hasBody),
            body: hasBody ? JSON.stringify(payload) : undefined,
          },
          path,
        ));
      } catch (err) {
        // Network error or timeout: retry idempotent requests with backoff; on the
        // last attempt (or a non-idempotent method) rethrow the original error.
        if (idempotent && attempt < this.maxRetries) {
          await delay(this.backoffMs(attempt));
          continue;
        }
        throw err;
      }

      const transient = res.status === 429 || (idempotent && res.status >= 500 && res.status < 600);
      if (transient && attempt < this.maxRetries) {
        await delay(this.backoffMs(attempt, res));
        continue;
      }

      let data: unknown = undefined;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!res.ok) throw new WordstatError(res.status, data);
      return data as T;
    }
  }

  /** Top popular queries containing the phrase, plus semantically related ones. */
  async topRequests(p: TopRequestsParams): Promise<unknown> {
    return this.request("POST", "v2/wordstat/topRequests", compact({
      phrase: p.phrase,
      numPhrases: p.numPhrases,
      regions: p.regionIds?.map(String),
      devices: p.devices?.map(mapDevice),
    }));
  }

  /** Frequency of the phrase over time. */
  async dynamics(p: DynamicsParams): Promise<unknown> {
    return this.request("POST", "v2/wordstat/dynamics", compact({
      phrase: p.phrase,
      period: p.period ? mapPeriod(p.period) : undefined,
      fromDate: p.fromDate,
      toDate: p.toDate,
      regions: p.regionIds?.map(String),
      devices: p.devices?.map(mapDevice),
    }));
  }

  /** Distribution of the phrase's demand across regions (with affinity index). */
  async regions(p: RegionsParams): Promise<unknown> {
    return this.request("POST", "v2/wordstat/regions", compact({
      phrase: p.phrase,
      region: p.regionMode ? mapRegionMode(p.regionMode) : undefined,
    }));
  }

  /**
   * The reference tree of region ids → names that the other methods accept.
   * The tree is static within a process, so it is fetched once and reused (this
   * also dedupes concurrent calls). A failed fetch is not cached. In per-request
   * MCP hosts the cache dies with the request; long-lived clients skip the
   * re-download.
   */
  async regionsTree(): Promise<unknown> {
    if (!this.regionsTreeCache) {
      this.regionsTreeCache = this.request("POST", "v2/wordstat/getRegionsTree", {}).catch((err) => {
        this.regionsTreeCache = undefined;
        throw err;
      });
    }
    return this.regionsTreeCache;
  }
}

/** Drops keys whose value is `undefined` so they are not sent to the API. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
