---
name: keyword-research
description: Research Yandex search demand for a keyword list: budget the per-key quota, read count values as numbers rather than strings, and pick the right call for the date range you need.
---

# Yandex Wordstat MCP

## What this server covers

Aggregated search demand in Yandex search: how often a phrase is typed, when, and where.
This is not Yandex Direct — there are no campaigns, ads, bids, clicks or spend here, and
the data is not tied to any ad account. Everything is read-only.

## Budget the quota before the first call

One call covers **one phrase**, so comparing N keywords costs N calls from the Yandex Cloud
Search API quota, which is counted per key and shared across every call. Do not run a whole
keyword list blindly: pick the phrases that decide the question, and reuse what you already
fetched.

## Pick the right call

Only the dynamics call accepts a date range. Top-requests and regions always report the
last 30 days, so asking them for a custom period silently gives you the default window.

The region tree is cached in the process, so re-reading it costs nothing.

## Read counts as numbers

`count` values are int64 and often arrive as JSON strings. Convert them before sorting or
summing, or "900" will sort above "1000".

## Errors worth not retrying

The server already retries 429, 5xx and network errors with increasing pauses, so repeating
the same call after one of those is wasted quota. A 401 or 403 means the key lacks Search
API access or the folder id points at the wrong folder — that is an operator fix, not a
problem with the phrase.

