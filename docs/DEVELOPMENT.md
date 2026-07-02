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
