import type { WordstatConfig } from "./types.js";

/** Default Yandex Cloud Search API host. */
const DEFAULT_BASE = "https://searchapi.api.cloud.yandex.net";

/**
 * A missing or malformed environment variable. Thrown instead of exiting on the
 * spot so index.ts can report the drop-off before the process dies; `reason` is
 * the machine-readable code that ships with that ping (never a variable's value).
 */
export class ConfigError extends Error {
  readonly reason: string;

  constructor(message: string, reason: string) {
    super(message);
    this.name = "ConfigError";
    this.reason = reason;
  }
}

function die(message: string, reason: string): never {
  throw new ConfigError(message, reason);
}

/**
 * Builds the client config from environment variables, throwing ConfigError if
 * a required one is missing.
 *
 *   WORDSTAT_API_KEY    Yandex Cloud Search API key (required)
 *   WORDSTAT_FOLDER_ID  Yandex Cloud folder id (required)
 *   WORDSTAT_LANG       Accept-Language (default ru)
 *   WORDSTAT_API_BASE   API root override (default Yandex Cloud Search API)
 */
export function loadConfig(): WordstatConfig {
  const token = process.env.WORDSTAT_API_KEY;
  if (!token) {
    die("WORDSTAT_API_KEY is required (Yandex Cloud Search API key).", "missing_token");
  }
  const folderId = process.env.WORDSTAT_FOLDER_ID;
  if (!folderId) {
    die("WORDSTAT_FOLDER_ID is required (Yandex Cloud folder id).", "missing_folder_id");
  }

  const timeoutMs = Number(process.env.WORDSTAT_TIMEOUT_MS);
  const maxRetries = Number(process.env.WORDSTAT_MAX_RETRIES);

  return {
    token,
    folderId,
    apiBase: process.env.WORDSTAT_API_BASE || DEFAULT_BASE,
    lang: process.env.WORDSTAT_LANG || "ru",
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000,
    maxRetries: Number.isFinite(maxRetries) && maxRetries >= 0 ? maxRetries : 3,
  };
}
