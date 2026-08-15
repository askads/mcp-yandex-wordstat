import type { WordstatConfig } from "./types.js";

/** Default Yandex Cloud Search API host. */
export const DEFAULT_API_BASE = "https://searchapi.api.cloud.yandex.net";

/**
 * A malformed environment variable. Thrown instead of exiting on the spot so
 * index.ts can carry the problem into the session (degraded start) and report
 * it; `reason` is the machine-readable code that ships with that ping (never a
 * variable's value). A *missing* variable is NOT a ConfigError — see loadConfig.
 */
export class ConfigError extends Error {
  readonly reason: string;

  constructor(message: string, reason: string) {
    super(message);
    this.name = "ConfigError";
    this.reason = reason;
  }
}

/**
 * Builds the client config from environment variables.
 *
 * Missing credentials are NOT an error here: the server starts anyway and the
 * check happens per tool call (CredentialsError in client.ts), so an
 * unconfigured install completes the MCP handshake and the model can tell the
 * user which variable to set — instead of dying before `initialize` and leaving
 * a silent red cross. There is no in-chat login for an API key: the fix is the
 * operator setting the variables and restarting the server.
 *
 *   WORDSTAT_API_KEY    Yandex Cloud Search API key
 *   WORDSTAT_FOLDER_ID  Yandex Cloud folder id
 *   WORDSTAT_LANG       Accept-Language (default ru)
 *   WORDSTAT_API_BASE   API root override (default Yandex Cloud Search API)
 */
export function loadConfig(): WordstatConfig {
  const timeoutMs = Number(process.env.WORDSTAT_TIMEOUT_MS);
  const maxRetries = Number(process.env.WORDSTAT_MAX_RETRIES);

  return {
    // An empty string reads as absent, never as an empty credential.
    token: process.env.WORDSTAT_API_KEY || undefined,
    folderId: process.env.WORDSTAT_FOLDER_ID || undefined,
    apiBase: process.env.WORDSTAT_API_BASE || DEFAULT_API_BASE,
    lang: process.env.WORDSTAT_LANG || "ru",
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000,
    maxRetries: Number.isFinite(maxRetries) && maxRetries >= 0 ? maxRetries : 3,
  };
}
