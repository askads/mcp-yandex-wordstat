# CLAUDE.md — mcp-yandex-wordstat

MCP server for the Yandex Wordstat API (TypeScript, stdio). Read-only: tools wrap
the search-demand reports (top/related queries, dynamics, regional distribution);
`raw_request` is the escape hatch. The server talks to the **Yandex Cloud Search
API v2** (`searchapi.api.cloud.yandex.net`, `POST /v2/wordstat/*`); auth is an
`Api-Key` and every request body carries a `folderId`. (The legacy standalone
`oauth` flavor — `api.wordstat.yandex.net`, Bearer, `v1/*` — was removed in 2.0.0;
Yandex folded that functionality into the Search API.)

## Commands

```bash
npm run dev        # run from source (tsx watch)
npm test           # unit tests, no network
npm run typecheck  # types for src + tests
npm run build      # emit dist/
npm run smoke      # live READ-ONLY call (needs WORDSTAT_API_KEY + WORDSTAT_FOLDER_ID)
```

## Architecture

- `src/config.ts` — env → config. Missing `WORDSTAT_API_KEY` / `WORDSTAT_FOLDER_ID` is NOT an
  error: the fields stay `undefined`, the server starts degraded and the client raises
  `CredentialsError` at call time. `ConfigError` (with a `reason` code) is reserved for
  malformed values, caught by `loadConfigOrDegraded` in `index.ts` (no such checks exist today).
  Optional `WORDSTAT_LANG`, `WORDSTAT_API_BASE`, `WORDSTAT_TIMEOUT_MS`, `WORDSTAT_MAX_RETRIES`.
- `src/client.ts` — maps each logical call (`topRequests`/`dynamics`/`regions`/`regionsTree`)
  to a `v2/wordstat/*` path: `Api-Key` auth, all `POST`, `folderId` injected into every body,
  regions as **strings**, `DEVICE_*` / `PERIOD_*` / `REGION_*` enums. `request()` first rejects
  a missing credential with `CredentialsError` (before building the request, the retries and
  fetch — the message is the product: it names the env variable to set and the needed restart),
  then resolves the path against the base and rejects any path that escapes to a foreign origin
  (SSRF guard), retries 429 / 5xx / network errors with backoff (honors `Retry-After`), enforces
  an AbortController timeout that also covers reading the body, and throws `WordstatError(status, body)`.
- `src/tools/wordstat.ts` — `top_requests`, `dynamics`, `regions`, `list_regions`. Inputs are
  normalized (`regionIds`, `devices`, `period`, `regionMode`); the client does the wire mapping.
  `src/tools/raw.ts` — `raw_request` (POST only). `src/tools/util.ts` — `ok`/`fail`, the
  `READ_ONLY` annotation and shared zod schema factories (`deviceEnum`, `rfc3339Date`).
- `src/index.ts` — wires every `register*` into the McpServer. `loadConfigOrDegraded` starts
  the server even on a config problem; without credentials the initialize `instructions` open
  with the unconfigured prefix (set `WORDSTAT_API_KEY` / `WORDSTAT_FOLDER_ID` and restart).
- `src/telemetry.ts` — anonymous usage pings (ids/names/versions only, never data or
  arguments; fire-and-forget, must never block or throw; opt-out `ASKADS_TELEMETRY=0`).
  `server_start` means "a usable install started"; an install without credentials sends
  `unconfigured_start` instead. The `reason` is a closed vocabulary (`missing_token`,
  `missing_folder_id`) — never a variable's name or value. `startup_failed` remains for a
  config unusable at load time (malformed values), also fire-and-forget.

## Conventions (do not break)

- **Never exit because of configuration.** A server that dies before the MCP handshake leaves
  the user with a red cross and no reason — the sibling Metrica server's telemetry showed that
  state accounted for nearly every unconfigured install. Missing credentials are a survivable
  state: start, answer `initialize`/`tools/list` (with the unconfigured prefix in the
  instructions), and reject tool calls with `CredentialsError`. There are no login tools:
  credentials come only from the environment, so the fix is the operator setting
  `WORDSTAT_API_KEY` / `WORDSTAT_FOLDER_ID` and restarting the server.
  `config.test.ts`, `client.test.ts` and `test/dist-smoke.test.js` pin this.
- **Credential failures are not transport failures.** `CredentialsError` is thrown before the
  retry/backoff branch (and before fetch) in `request()` — retrying it burns seconds of backoff
  before the user sees the one message that helps. Pinned by "fetch must not be called"
  assertions in `client.test.ts`.
- **Read-only.** The Wordstat API has no write endpoints; all tools (and `raw_request`)
  carry `READ_ONLY`. Don't add write paths.
- **Wire mapping lives in the client, not the tools.** Tools accept normalized inputs and
  must not know the wire vocabulary — add any mapping in `client.ts` (`mapDevice` /
  `mapPeriod` / `mapRegionMode` and the per-method body builders).
- **folderId is the client's job.** It is injected into every POST body in `request()`; tools
  never pass it.
- **Validate inputs with zod** in `inputSchema`; keep the normalized vocabulary
  (`all|desktop|phone|tablet`, `daily|weekly|monthly`, `all|cities|regions`). Reuse the shared
  schema **factories** in `util.ts` (a fresh schema per field avoids `$ref` dedup in the JSON schema).
- **Output compact JSON via `ok`** — the consumer is an LLM; pretty-printing burns tokens.
  Responses pass through verbatim (describe the fields in the tool `description`, the only
  place the external model reads).
- **Counts can be strings.** Yandex serializes int64 counts as JSON strings; don't assume number.

## Adding a tool

Before changing the tool registry, read [the MCP capability documentation contract](docs/CAPABILITY-DOCUMENTATION.md). Every registered tool must have exactly one task-oriented page in `docs/capabilities/`; update that page, the index, and the coverage test in the same change.

1. Add (or extend) `src/tools/<name>.ts` with `register<Name>Tools(server, client)`.
2. If it hits a new endpoint, add a method to `src/client.ts` with the wire mapping.
3. Import and call the register fn in `src/index.ts`.
4. Add a `*.test.ts` using the mock-fetch (client) / fake-client (tools) harness — no network.
5. `npm run typecheck && npm test`.

## Releasing

Keep the version in sync across **all** channels in one go — publishing to npm alone silently
drifts from the rest (`git push --follow-tags` pushes the tag but does **not** create a GitHub
Release; the registry is immutable per version, so even a metadata-only change needs a bump):

1. Bump `version` in **three places, identically**: `package.json`, and in `server.json`
   **both** the root `version` **and** `packages[0].version`. `mcpName` in `package.json` must
   match `name` in `server.json`. Verify before publishing — all three must print the same X.Y.Z:
   `grep -n '"version"' package.json server.json`.
   > ⚠️ `mcp-publisher` publishes the **root** `server.json.version`. If you bump npm +
   > `packages[0].version` but leave the root stale, `npm publish` still succeeds (it reads
   > `package.json`), yet `mcp-publisher publish` fails with a misleading
   > `400 cannot publish duplicate version` — it is re-publishing the old root version. (Bit us on
   > the 2.0.0 release: root was left at 1.0.1 while everything else was 2.0.0.)
2. `npm publish` (runs typecheck + tests + build via `prepublishOnly` / `prepare`).
3. `git commit`, `git tag -a vX.Y.Z -m vX.Y.Z`, `git push origin main --follow-tags`.
4. **GitHub Release:** `gh release create vX.Y.Z --title vX.Y.Z --generate-notes --verify-tag`.
5. **Official MCP registry:** `mcp-publisher publish`.
