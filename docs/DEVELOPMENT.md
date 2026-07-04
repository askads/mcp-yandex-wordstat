# Development

## Requirements

- Node.js 20+ (the published package ships compiled `dist/`; `npx` needs no separate
  install). CI runs the suite on Node 20, 22 and 24.

## Commands

```bash
npm install
npm run dev        # run from source with tsx watch
npm test           # unit tests (node:test), no network
npm run typecheck  # type-check src + tests (no emit)
npm run build      # clean dist/ and compile with tsc
npm run smoke      # live READ-ONLY call: top requests for a sample phrase
```

## Local run

```bash
npm run build
WORDSTAT_API_KEY=... WORDSTAT_FOLDER_ID=... node dist/index.js
# optional: WORDSTAT_LANG, WORDSTAT_API_BASE, WORDSTAT_TIMEOUT_MS, WORDSTAT_MAX_RETRIES
```

`npm run smoke` needs the same credentials and makes one live read (no writes exist).

## Tests

Unit tests mock `globalThis.fetch` (client) or use a fake server + mock/real client
(tools), so the whole suite runs offline. Put a `*.test.ts` next to the code it
covers; `npm run typecheck && npm test` is the gate (also run by `prepublishOnly`).

## README demo GIF

`docs/demo.gif` is a recording of a real MCP session: `docs/demo/run.mjs` starts
the built server over stdio and makes real tools/call requests through the
official SDK, while `docs/demo/mock-api.mjs` (loaded into the server process via
`NODE_OPTIONS=--import`) patches the global `fetch` and serves canned Yandex Cloud
Search API (Wordstat) responses — no key and no network needed. Regenerate:

```bash
npm run build && vhs docs/demo.tape   # requires vhs: brew install vhs
```

Important: with the settings in `docs/demo.tape` the vhs terminal is 97 columns ×
33 rows, and the capture freezes if the buffer scrolls. When changing the scenario
or the fixtures, keep the whole output on a single screen — don't grow the text or
the tables without shrinking something else.
