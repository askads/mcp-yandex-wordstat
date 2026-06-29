# CLAUDE.md — mcp-yandex-wordstat

MCP server for the Yandex Wordstat API (TypeScript, stdio). Read-only: tools wrap
the search-demand reports (top/related queries, dynamics, regional distribution);
`raw_request` is the escape hatch. One server speaks **two flavors** of the API
(`WORDSTAT_FLAVOR`): `cloud` (Yandex Cloud Search API v2) and `oauth`
(api.wordstat.yandex.net).

## Commands

```bash
npm run dev        # run from source (tsx watch)
npm test           # unit tests, no network
npm run typecheck  # types for src + tests
npm run build      # emit dist/
npm run smoke      # live READ-ONLY call (needs creds for the active flavor)
```

## Architecture

- `src/config.ts` — env → config. Picks the flavor (`WORDSTAT_FLAVOR`, default `cloud`)
  and validates the creds that flavor needs: `cloud` → `WORDSTAT_API_KEY` +
  `WORDSTAT_FOLDER_ID`; `oauth` → `WORDSTAT_TOKEN`.
- `src/client.ts` — the only place the two flavors diverge. Holds the flavor and maps
  each logical call (`topRequests`/`dynamics`/`regions`/`regionsTree`) to the right host,
  path, auth header and body:
  - cloud → `Api-Key` auth, `v2/wordstat/*` (all POST), `folderId` injected into every
    body, regions as **strings**, `DEVICE_*` / `PERIOD_*` / `REGION_*` enums.
  - oauth → `Bearer` auth, `v1/*`, regions as **numbers**, lowercase device/period, region
    grouping passed in the `regions` field; `getRegionsTree` is **GET**.
  Retry/backoff on 429 + 5xx (honors `Retry-After`), AbortController timeout,
  `WordstatError(status, body)`.
- `src/tools/wordstat.ts` — `top_requests`, `dynamics`, `regions`, `list_regions`. Inputs
  are **flavor-agnostic** (normalized `regionIds`, `devices`, `period`, `regionMode`); the
  client does the per-flavor mapping. `src/tools/raw.ts` — `raw_request`.
- `src/index.ts` — wires every `register*` into the McpServer.

## Conventions (do not break)

- **Read-only.** The Wordstat API has no write endpoints; all tools (and `raw_request`)
  carry `READ_ONLY`. Don't add write paths.
- **Flavor logic lives in the client, not the tools.** Tools accept normalized inputs and
  must not branch on the flavor — add any wire mapping in `client.ts` (`mapDevice` /
  `mapPeriod` / `mapRegionMode` and the per-method body builders).
- **folderId is the client's job.** It is injected for `cloud` POSTs in `request()`; tools
  never pass it.
- **Validate inputs with zod** in `inputSchema`; keep the normalized vocabulary
  (`all|desktop|phone|tablet`, `daily|weekly|monthly`, `all|cities|regions`).
- **Output compact JSON via `ok`** — the consumer is an LLM; pretty-printing burns tokens.
  Responses pass through verbatim (field names differ slightly by flavor — say so in the
  tool `description`, the only place the external model reads).
- **Counts can be strings.** Yandex serializes int64 counts as JSON strings; don't assume number.

## Adding a tool

1. Add (or extend) `src/tools/<name>.ts` with `register<Name>Tools(server, client)`.
2. If it hits a new endpoint, add a method to `src/client.ts` with the per-flavor mapping.
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
