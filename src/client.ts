import type { Device, Period, RegionMode, WordstatConfig, WordstatFlavor } from "./types.js";
import { WordstatError } from "./types.js";

export type HttpMethod = "GET" | "POST";

/** Normalized inputs for the top/related-queries report. */
export interface TopRequestsParams {
  phrase: string;
  /** Region ids to scope demand to (e.g. 213 = Moscow). Coerced per flavor. */
  regionIds?: Array<string | number>;
  devices?: Device[];
  /** Max phrases to return (cloud only: numPhrases 1..2000). Ignored on oauth. */
  numPhrases?: number;
}

/** Normalized inputs for the time-dynamics report. */
export interface DynamicsParams {
  phrase: string;
  period?: Period;
  /** Period start. Cloud expects RFC3339; oauth expects YYYY-MM-DD. Passed through. */
  fromDate?: string;
  /** Period end (must align to the period boundary). Passed through. */
  toDate?: string;
  regionIds?: Array<string | number>;
  devices?: Device[];
}

/** Normalized inputs for the regional-distribution report. */
export interface RegionsParams {
  phrase: string;
  regionMode?: RegionMode;
  devices?: Device[];
}

/** Maps a normalized device bucket to the wire value for each flavor. */
function mapDevice(d: Device, flavor: WordstatFlavor): string {
  if (flavor === "cloud") {
    return { all: "DEVICE_ALL", desktop: "DEVICE_DESKTOP", phone: "DEVICE_PHONE", tablet: "DEVICE_TABLET" }[d];
  }
  return d; // oauth: all | desktop | phone | tablet
}

/** Maps a normalized period to the wire value for each flavor. */
function mapPeriod(p: Period, flavor: WordstatFlavor): string {
  if (flavor === "cloud") {
    return { daily: "PERIOD_DAILY", weekly: "PERIOD_WEEKLY", monthly: "PERIOD_MONTHLY" }[p];
  }
  return p; // oauth: daily | weekly | monthly
}

/** Maps a normalized region-distribution mode to the wire value for each flavor. */
function mapRegionMode(m: RegionMode, flavor: WordstatFlavor): string {
  if (flavor === "cloud") {
    return { all: "REGION_ALL", cities: "REGION_CITIES", regions: "REGION_REGIONS" }[m];
  }
  return m; // oauth: all | cities | regions
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

  get flavor(): WordstatFlavor {
    return this.config.flavor;
  }

  private get isCloud(): boolean {
    return this.config.flavor === "cloud";
  }

  private headers(hasBody: boolean): Record<string, string> {
    const auth = this.isCloud ? `Api-Key ${this.config.token}` : `Bearer ${this.config.token}`;
    const h: Record<string, string> = { Authorization: auth, "Accept-Language": this.config.lang };
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
   * Low-level request to a Wordstat API path (e.g. "v2/wordstat/topRequests" or
   * "v1/topRequests"). For the cloud flavor, folderId is injected into the body
   * when absent. Retries 429 and 5xx with backoff; any other non-2xx throws a
   * {@link WordstatError}.
   */
  async request<T = unknown>(method: HttpMethod, path: string, body?: Record<string, unknown>): Promise<T> {
    let payload = body;
    if (this.isCloud && method === "POST") {
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
    const devices = p.devices?.map((d) => mapDevice(d, this.flavor));
    if (this.isCloud) {
      return this.request("POST", "v2/wordstat/topRequests", compact({
        phrase: p.phrase,
        numPhrases: p.numPhrases,
        regions: p.regionIds?.map(String),
        devices,
      }));
    }
    return this.request("POST", "v1/topRequests", compact({
      phrase: p.phrase,
      regions: p.regionIds?.map(Number),
      devices,
    }));
  }

  /** Frequency of the phrase over time. */
  async dynamics(p: DynamicsParams): Promise<unknown> {
    const period = p.period ? mapPeriod(p.period, this.flavor) : undefined;
    const devices = p.devices?.map((d) => mapDevice(d, this.flavor));
    if (this.isCloud) {
      return this.request("POST", "v2/wordstat/dynamics", compact({
        phrase: p.phrase,
        period,
        fromDate: p.fromDate,
        toDate: p.toDate,
        regions: p.regionIds?.map(String),
        devices,
      }));
    }
    return this.request("POST", "v1/dynamics", compact({
      phrase: p.phrase,
      period,
      fromDate: p.fromDate,
      toDate: p.toDate,
      regions: p.regionIds?.map(Number),
      devices,
    }));
  }

  /** Distribution of the phrase's demand across regions (with affinity index). */
  async regions(p: RegionsParams): Promise<unknown> {
    const devices = p.devices?.map((d) => mapDevice(d, this.flavor));
    if (this.isCloud) {
      return this.request("POST", "v2/wordstat/regions", compact({
        phrase: p.phrase,
        region: p.regionMode ? mapRegionMode(p.regionMode, "cloud") : undefined,
      }));
    }
    // oauth: the grouping mode is passed in the `regions` field (not an id list).
    return this.request("POST", "v1/regions", compact({
      phrase: p.phrase,
      regions: p.regionMode ? mapRegionMode(p.regionMode, "oauth") : undefined,
      devices,
    }));
  }

  /** The reference tree of region ids → names that the other methods accept. */
  async regionsTree(): Promise<unknown> {
    if (this.isCloud) return this.request("POST", "v2/wordstat/getRegionsTree", {});
    return this.request("GET", "v1/getRegionsTree");
  }
}

/** Drops keys whose value is `undefined` so they are not sent to the API. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
