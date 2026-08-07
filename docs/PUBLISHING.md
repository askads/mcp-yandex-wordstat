# Публикация и листинг сервера

Как выпустить новую версию и попасть в каталоги MCP, чтобы сервер находили из
Claude, Cursor, LobeHub и др. Канонический источник — **официальный реестр MCP**
(`registry.modelcontextprotocol.io`).

## Синхронизация версий (важно)

Версия живёт в **трёх местах и должна совпадать байт-в-байт**:

- `package.json` → `version`;
- `server.json` → корневой `version`;
- `server.json` → `packages[0].version`.

А `mcpName` в `package.json` должен совпадать с `name` в `server.json`
(`io.github.askads/mcp-yandex-wordstat`). Проверка перед публикацией — все три
должны напечатать один и тот же `X.Y.Z`:

```bash
grep -n '"version"' package.json server.json
```

> ⚠️ `mcp-publisher` публикует **корневой** `server.json.version`. Если поднять npm +
> `packages[0].version`, но оставить корневой устаревшим, `npm publish` пройдёт (он
> читает `package.json`), а `mcp-publisher publish` упадёт с обманчивым
> `400 cannot publish duplicate version` — он пере-публикует старую корневую версию.

## Релиз (все каналы за один раз)

Публикация только в npm молча расходится с остальными каналами: `git push --follow-tags`
пушит тег, но **не создаёт** GitHub Release, а реестр иммутабелен по версии (даже правка
метаданных требует бампа).

1. Поднять `version` в трёх местах (см. выше) и обновить `CHANGELOG.md`
   (перенести `[Unreleased]` в датированную секцию).
2. `npm publish` — прогоняет `typecheck` + `test` + `build` (через `prepublishOnly` / `prepare`).
3. `git commit`, `git tag -a vX.Y.Z -m vX.Y.Z`, `git push origin main --follow-tags`.
4. **GitHub Release:** `gh release create vX.Y.Z --title vX.Y.Z --generate-notes --verify-tag`.
5. **Официальный реестр MCP:**

```bash
brew install mcp-publisher                            # или бинарь из релизов modelcontextprotocol/registry
mcp-publisher logout                                  # login поверх живого токена его не перевыпустит
mcp-publisher login github --token "$(gh auth token)" # НЕ голый `login github` — см. ниже
mcp-publisher publish                                 # из корня репозитория (где лежит server.json)
```

> ⚠️ **Вход именно по токену, а не через device-flow.** `mcp-publisher login github` без
> `--token` авторизует OAuth-приложение реестра, а организация с политикой «Only approved
> applications can access data» такому приложению не видна — реестр получает пустой список
> организаций и отвечает `403 Forbidden: You have permission to publish:
> io.github.<личный-логин>/*`. Токен `gh` уже имеет scope `read:org` и организацию видит.
>
> Опознаётся по самому тексту 403: в нём перечислены доступные namespace. Если там **только
> личный** `io.github.<логин>/*` и ни одной организации — дело в способе входа. Публичность
> членства (`gh api -X PUT /orgs/askads/public_members/<логин>`) необходима, но её одной мало;
> проверить: `curl -s https://api.github.com/users/<логин>/orgs` должен показывать `askads`.

### Что проверяет реестр

- **Namespace** — имя `io.github.askads/*` подтверждается входом под GitHub-аккаунтом с
  доступом к организации `askads`.
- **Владение npm-пакетом** — в опубликованном `package.json` поле `mcpName` должно
  совпадать с `name` из `server.json`. Пакет с `mcpName` уже должен быть в npm.

## LobeHub

1. Открыть [lobehub.com/mcp](https://lobehub.com/mcp) → **Submit MCP**.
2. Указать URL репозитория `https://github.com/askads/mcp-yandex-wordstat`.
   LobeHub сам подтянет README, список инструментов и конфиг установки
   (`npx -y mcp-yandex-wordstat`).
