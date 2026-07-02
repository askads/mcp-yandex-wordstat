# Tools

All tools are read-only — the Yandex Wordstat API (Yandex Cloud Search API v2) has
no write endpoints. Inputs are normalized; the client maps them to the API's wire
values (`DEVICE_*` / `PERIOD_*` / `REGION_*`) and injects `folderId`.

## Reports

| Tool | Description |
|---|---|
| `top_requests` | Search demand for a phrase over the last 30 days: the most popular queries that CONTAIN the phrase (`results`) plus semantically RELATED queries (`associations`) and `totalCount`. Optional `regionIds`, `devices`; `numPhrases` (1..2000) sets how many to return. |
| `dynamics` | How demand changed over time — a series of `{date, count, share}`. `period` sets granularity (`daily`/`weekly`/`monthly`); `fromDate`/`toDate` bound the range as RFC3339 timestamps (`toDate` aligned to the period boundary). Optional `regionIds`, `devices`. |
| `regions` | Distribution of demand across regions over the last 30 days: `count`, `share` and `affinityIndex` (>100% = above-average interest). `regionMode` groups by `all` / `cities` / `regions`. |
| `list_regions` | The reference tree of region ids → names. Ids feed `regionIds`/`regionMode`; names decode region ids in responses. Static and cached once per process. |

Notes:
- **Counts can be strings.** Yandex serializes int64 counts as JSON strings — don't assume number.
- **Region ids:** get them from `list_regions`, e.g. `213` (Moscow), `2` (St. Petersburg).
- **Devices:** any of `all`, `desktop`, `phone`, `tablet`.

## Escape hatch

| Tool | Description |
|---|---|
| `raw_request` | Call any Yandex Cloud Search API Wordstat path directly (e.g. `v2/wordstat/topRequests`) for endpoints without a dedicated tool. Every Wordstat endpoint is `POST`; `body` is sent as JSON and `folderId` is injected automatically. A `path` that resolves to a foreign origin is rejected (SSRF guard). |

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `WORDSTAT_API_KEY` | yes | — | Yandex Cloud API key (Search API), sent as `Api-Key`. Treat it as a secret. |
| `WORDSTAT_FOLDER_ID` | yes | — | Yandex Cloud folder id, injected into every request body. |
| `WORDSTAT_LANG` | no | `ru` | `Accept-Language` header. |
| `WORDSTAT_API_BASE` | no | `https://searchapi.api.cloud.yandex.net` | API root host override. |
| `WORDSTAT_TIMEOUT_MS` | no | `60000` | Per-request timeout, ms. |
| `WORDSTAT_MAX_RETRIES` | no | `3` | Retries on transient errors (429, 5xx, network). |
