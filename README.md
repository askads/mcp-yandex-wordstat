# Yandex Wordstat MCP

[![npm](https://img.shields.io/npm/v/mcp-yandex-wordstat)](https://www.npmjs.com/package/mcp-yandex-wordstat)
[![CI](https://github.com/askads/mcp-yandex-wordstat/actions/workflows/ci.yml/badge.svg)](https://github.com/askads/mcp-yandex-wordstat/actions/workflows/ci.yml)
[![Glama](https://glama.ai/mcp/servers/askads/mcp-yandex-wordstat/badges/score.svg)](https://glama.ai/mcp/servers/askads/mcp-yandex-wordstat)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

MCP-сервер для **Yandex Wordstat (Яндекс Вордстат)**: спрашивайте статистику поискового
спроса — частотность, похожие запросы, сезонность и география — из Claude, Cursor, Codex и
других AI-клиентов на естественном языке.

Ассистент сам подбирает ключевые слова, оценивает спрос и его динамику и сравнивает регионы —
то, что в вебе Вордстата приходится листать по трём вкладкам вручную.

## Что умеет

- **Топ и похожие запросы** — `top_requests`: популярные запросы с фразой + семантически
  близкие (`associations`) и общий объём за 30 дней.
- **Динамика** — `dynamics`: ряд `{date, count, share}` по дням/неделям/месяцам — сезонность и тренд.
- **Регионы** — `regions`: распределение спроса по регионам с `affinityIndex` (где интерес
  выше/ниже среднего); режимы `all` / `cities` / `regions`.
- **Справочник регионов** — `list_regions`: дерево `id → name` для фильтров и расшифровки регионов.
- **Универсальный `raw_request`** — прямой вызов любого пути API.
- **Yandex Cloud Search API v2** — auth, endpoints и схемы скрыты за нормализованными инструментами.
- **Устойчивость** — ретраи на 429/5xx с бэкоффом и таймаут запроса.

## Примеры запросов

Попросите ассистента на русском — например:

- «Сколько в месяц ищут "купить велосипед" и какие есть похожие запросы?»
- «Покажи сезонность спроса на "лыжи" по месяцам за год»
- «В каких городах выше всего интерес к "доставка пиццы"?»
- «Подбери ключи вокруг "ремонт квартир" с частотностью»

## Доступ к API

Сервер работает через **Yandex Cloud Search API v2** (хост `searchapi.api.cloud.yandex.net`,
авторизация API-ключом Yandex Cloud). Данные Вордстата — публичная агрегированная статистика
спроса (не привязана к рекламному аккаунту), поэтому один API-ключ обслуживает весь сервер.
Открывается self-serve, тем же ключом, что и YandexGPT — заявок и активных кампаний не нужно.

> **Старый отдельный API Вордстата (`api.wordstat.yandex.net`, OAuth) больше недоступен.** Яндекс
> перенёс эту функциональность в Yandex Search API на платформе Yandex Cloud (это и есть бэкенд
> сервера); отдельной осталась только веб-версия на [wordstat.yandex.ru](https://wordstat.yandex.ru).
> Поддержка флейвора `oauth` удалена в версии 2.0.0.

## Быстрая установка

<details open>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add yandex-wordstat \
  -e WORDSTAT_API_KEY=ваш_ключ -e WORDSTAT_FOLDER_ID=ваш_folder \
  -- npx -y mcp-yandex-wordstat
```

</details>

<details>
<summary><b>Claude Desktop</b></summary>

`claude_desktop_config.json` — macOS `~/Library/Application Support/Claude/`, Windows `%APPDATA%\Claude\`

```json
{
  "mcpServers": {
    "yandex-wordstat": {
      "command": "npx",
      "args": ["-y", "mcp-yandex-wordstat"],
      "env": { "WORDSTAT_API_KEY": "ваш_ключ", "WORDSTAT_FOLDER_ID": "ваш_folder" }
    }
  }
}
```

</details>

<details>
<summary><b>Cursor</b></summary>

`~/.cursor/mcp.json` (или `.cursor/mcp.json` в проекте)

```json
{
  "mcpServers": {
    "yandex-wordstat": {
      "command": "npx",
      "args": ["-y", "mcp-yandex-wordstat"],
      "env": { "WORDSTAT_API_KEY": "ваш_ключ", "WORDSTAT_FOLDER_ID": "ваш_folder" }
    }
  }
}
```

</details>

<details>
<summary><b>VS Code</b></summary>

`.vscode/mcp.json` — ключ `servers` (не `mcpServers`)

```json
{
  "servers": {
    "yandex-wordstat": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-yandex-wordstat"],
      "env": { "WORDSTAT_API_KEY": "ваш_ключ", "WORDSTAT_FOLDER_ID": "ваш_folder" }
    }
  }
}
```

</details>

## Получение доступа

1. Создайте сервисный аккаунт с ролью `search-api.webSearch.user` и получите для него
   API-ключ со scope `yc.search-api.execute` — см.
   [документацию AI Studio](https://yandex.cloud/ru/docs/ai-studio/operations/get-api-key).
2. Узнайте `folderId` каталога в Cloud Console.
3. Запишите ключ в `WORDSTAT_API_KEY`, каталог — в `WORDSTAT_FOLDER_ID`.

⚠️ Ключ хранится **открытым текстом** в конфиге клиента — относитесь как к паролю.

## Настройка

| Переменная | Обяз. | По умолчанию | Описание |
|---|---|---|---|
| `WORDSTAT_API_KEY` | да | — | API-ключ Yandex Cloud (Search API). |
| `WORDSTAT_FOLDER_ID` | да | — | Идентификатор каталога Yandex Cloud. |
| `WORDSTAT_LANG` | нет | `ru` | Заголовок `Accept-Language`. |
| `WORDSTAT_API_BASE` | нет | `https://searchapi.api.cloud.yandex.net` | Корень API (override). |
| `WORDSTAT_TIMEOUT_MS` | нет | `60000` | Таймаут запроса, мс. |
| `WORDSTAT_MAX_RETRIES` | нет | `3` | Повторы при 429/5xx. |

## Требования

- Node.js 20+ (запускается через `npx`, отдельная установка не нужна).
- Доступ к Yandex Cloud Search API — см. [Получение доступа](#получение-доступа).

## Ограничения

- **Read-only.** У Wordstat API нет изменяющих операций — сервер только читает.
- **Общая квота.** Лимит (по биллингу Yandex Cloud Search API) считается на один ключ, общий
  для всех вызовов. Кэшируйте `list_regions` и ответы по фразам, не гоните частоту.

## Поддержка

Вопросы, идеи и доработки — пишите в Telegram: [@gistrec](http://t.me/gistrec).

## Лицензия

MIT — см. [LICENSE](./LICENSE).
