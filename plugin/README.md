# Yandex Wordstat MCP

Read Yandex search-demand statistics from Claude: how often a phrase is searched, when, and in which regions.

This plugin is an **unofficial, third-party client** published by AskAds. It is not
affiliated with, endorsed by, or operated by the owner of the API it talks to.

## What the plugin does

Enabling the plugin registers one MCP server named `yandex-wordstat`. Claude Code starts it by
running `npx -y mcp-yandex-wordstat@2.3.0`, which downloads that exact published version of the
`mcp-yandex-wordstat` npm package and runs it on your machine. The version is pinned, so the plugin never
pulls a newer release without an update to this plugin.

The server talks to the Yandex Search API / Wordstat (searchapi.api.cloud.yandex.net) over HTTPS, using the credentials you enter when the plugin
is enabled. It sends nothing to AskAds except the telemetry described below.

## What it needs from you

The plugin asks for its credentials through the plugin configuration dialog, not through
environment variables, so nothing has to be exported in your shell. Sensitive values go to
your operating system's credential store rather than to `settings.json`.

- **Yandex Cloud API key** (required) — API key with access to the Yandex Cloud Search API. Stored in your operating system's credential store, never in settings.json. Stored securely.
- **Yandex Cloud folder id** (required) — Folder the API key belongs to. Required: a key pointed at the wrong folder returns 401 or 403.
- **Anonymous telemetry** — Set to 0 to disable the anonymous usage telemetry the server sends by default. Leave as 1 to keep it on.

## Telemetry

The underlying server sends anonymous technical events by default: a random installation
identifier, the name of the tool that was called, and the versions of the server, the AI
app, Node.js and the operating system. Your access token, your account data, tool arguments
and the names and values of environment variables are **not** sent. Set the
**Anonymous telemetry** option to `0` to turn it off.

## Skills

`keyword-research` — Research Yandex search demand for a keyword list: budget the per-key quota, read count values as numbers rather than strings, and pick the right call for the date range you need.

## Source and license

Source: https://github.com/askads/mcp-yandex-wordstat. Released under the MIT license.
