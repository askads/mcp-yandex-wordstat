import type { WordstatConfig, WordstatFlavor } from "./types.js";

/** Default API host per flavor. */
const DEFAULT_BASE: Record<WordstatFlavor, string> = {
  cloud: "https://searchapi.api.cloud.yandex.net",
  oauth: "https://api.wordstat.yandex.net",
};

function die(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/**
 * Builds the client config from environment variables, exiting if anything
 * required for the chosen flavor is missing.
 *
 *   WORDSTAT_FLAVOR     cloud | oauth (default cloud)
 *   cloud → WORDSTAT_API_KEY (required), WORDSTAT_FOLDER_ID (required)
 *   oauth → WORDSTAT_TOKEN   (required)
 */
export function loadConfig(): WordstatConfig {
  const flavorRaw = (process.env.WORDSTAT_FLAVOR || "cloud").toLowerCase();
  if (flavorRaw !== "cloud" && flavorRaw !== "oauth") {
    die(`WORDSTAT_FLAVOR must be "cloud" or "oauth", got "${flavorRaw}".`);
  }
  const flavor = flavorRaw as WordstatFlavor;

  let token: string | undefined;
  let folderId: string | undefined;

  if (flavor === "cloud") {
    token = process.env.WORDSTAT_API_KEY;
    if (!token) die("WORDSTAT_API_KEY is required for WORDSTAT_FLAVOR=cloud.");
    folderId = process.env.WORDSTAT_FOLDER_ID;
    if (!folderId) die("WORDSTAT_FOLDER_ID is required for WORDSTAT_FLAVOR=cloud.");
  } else {
    token = process.env.WORDSTAT_TOKEN;
    if (!token) die("WORDSTAT_TOKEN is required for WORDSTAT_FLAVOR=oauth.");
  }

  const timeoutMs = Number(process.env.WORDSTAT_TIMEOUT_MS);
  const maxRetries = Number(process.env.WORDSTAT_MAX_RETRIES);

  return {
    flavor,
    token,
    folderId,
    apiBase: process.env.WORDSTAT_API_BASE || DEFAULT_BASE[flavor],
    lang: process.env.WORDSTAT_LANG || "ru",
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000,
    maxRetries: Number.isFinite(maxRetries) && maxRetries >= 0 ? maxRetries : 3,
  };
}
