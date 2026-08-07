import { ConfigError, loadConfig } from "./config.js";
import { WordstatClient } from "./client.js";

/** Live READ-ONLY smoke check: pulls top requests for a sample phrase. */
async function main(): Promise<void> {
  const client = new WordstatClient(loadConfig());
  const phrase = process.argv[2] ?? "яндекс";
  const result = await client.topRequests({ phrase, numPhrases: 5 });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  // A missing key is a user error, not a bug: report it without the stack.
  console.error("smoke failed:", err instanceof ConfigError ? err.message : err);
  process.exit(1);
});
