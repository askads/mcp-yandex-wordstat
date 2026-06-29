import type { Device, Period, RegionMode, WordstatConfig } from "./types.js";
import { WordstatError } from "./types.js";

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

export class WordstatClient {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;

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

  private async fetchWithTimeout(url: string, init: RequestInit, label: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Request to "${label}" timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Low-level request to a Search API Wordstat path (e.g. "v2/wordstat/topRequests").
   * folderId is injected into the body of every POST when absent. Retries 429 and
   * 5xx with backoff; any other non-2xx throws a {@link WordstatError}.
   */
  async request<T = unknown>(method: HttpMethod, path: string, body?: Record<string, unknown>): Promise<T> {
    let payload = body;
    if (method === "POST") {
      payload = { folderId: this.config.folderId, ...(body ?? {}) };
    }
    const hasBody = payload !== undefined && method !== "GET";
    const url = new URL(path.replace(/^\//, ""), this.base).toString();

    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchWithTimeout(
        url,
        {
          method,
          headers: this.headers(hasBody),
          body: hasBody ? JSON.stringify(payload) : undefined,
        },
        path,
      );

      const text = await res.text();

      const transient = res.status === 429 || (res.status >= 500 && res.status < 600);
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

  /** The reference tree of region ids → names that the other methods accept. */
  async regionsTree(): Promise<unknown> {
    return this.request("POST", "v2/wordstat/getRegionsTree", {});
  }
}

/** Drops keys whose value is `undefined` so they are not sent to the API. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
