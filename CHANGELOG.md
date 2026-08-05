# Changelog

Все заметные изменения проекта документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/),
проект придерживается [семантического версионирования](https://semver.org/lang/ru/).

## [Unreleased]

## [2.1.0] — 2026-08-05

### Добавлено
- Анонимная телеметрия использования: события `server_start` и `tool_call`
  (имя тула, версии пакета/Node/ОС, clientInfo из MCP initialize) на
  `usage.gistrec.cloud`. Токен, данные аккаунта, аргументы вызовов и промпты
  не отправляются; fire-and-forget с таймаутом 2 с. Отключение для всех
  MCP-серверов Ask Ads разом: `ASKADS_TELEMETRY=0` (подробности —
  docs/DEVELOPMENT.md).

### Изменено
- README: npx-команды с `@latest` — npx с закешированным пакетом не проверяет
  реестр, установки без тега оставались на версии момента установки.


## [2.0.1] — 2026-07-02

### Безопасность
- `raw_request` / HTTP-клиент: SSRF-гард в `request()` — абсолютный `path`
  (`https://…`, `http://…` или бэкслеш-форма `\\…`) больше не может перебить базовый
  origin и увести `Api-Key` на чужой хост; такой путь отклоняется до запроса.

### Исправлено
- `raw_request`: из `method` убран `GET` (оставлен только `POST`). У Yandex Cloud
  Search API v2 Вордстата GET-ручек нет, а при `GET` тело молча отбрасывалось и
  `folderId` не инжектился — вопреки описанию тула.
- Таймаут запроса теперь покрывает и чтение тела ответа: `fetchWithTimeout` читает
  `res.text()` внутри охраняемой зоны и снимает таймер только после этого.
- Сетевые ошибки и таймауты теперь ретраятся с бэкоффом (эндпоинты read-only,
  повтор безопасен) — раньше падали сразу, без повторов.
- `fail()` дописывает сообщение `err.cause`, если оно есть, — диагностируемость выше
  (секретов в `cause` нет).

### Добавлено
- Кэш статичного справочника регионов: `regionsTree` (`list_regions`) загружается
  один раз на процесс (и дедуплицирует конкурентные вызовы; неуспех не кэшируется).
- `server.json`: описаны переменные `WORDSTAT_API_BASE`, `WORDSTAT_TIMEOUT_MS`,
  `WORDSTAT_MAX_RETRIES`.
- Тесты: ретраи клиента (429/5xx/сеть/таймаут), SSRF-гард, `raw_request`,
  аннотации тулов, `util` (`rfc3339Date`, `fail` c `cause`).
- Каталог `docs/` (`TOOLS.md`, `DEVELOPMENT.md`, `PUBLISHING.md`) и раздел
  «Документация» в README.

### Изменено
- Аннотация `READ_ONLY` выставляет все четыре хинта
  (`readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint`) — часть клиентов
  (напр. ревью OpenAI Apps) требует их на каждом туле.
- `fromDate`/`toDate` в `dynamics` валидируются как RFC3339 через фабрику `rfc3339Date()`
  (свой zod-объект на поле, чтобы в JSON-схеме не появлялся общий `$ref`); строковая
  ветка `regionIds` сужена до числовых id (`/^\d+$/`).

### Документация
- `CLAUDE.md` переписан под cloud-only: убрано описание удалённой двух-флейворной
  архитектуры (`WORDSTAT_FLAVOR`/oauth, `api.wordstat.yandex.net`, Bearer, `v1/*`).

## [2.0.0] — 2026-06-29

### Изменено
- **Breaking:** удалён флейвор `oauth` (`api.wordstat.yandex.net`, Bearer, `v1/*`) —
  сервер стал cloud-only поверх **Yandex Cloud Search API v2**
  (`searchapi.api.cloud.yandex.net`, `POST /v2/wordstat/*`, `Api-Key`). Яндекс
  официально закрыл отдельный OAuth-API Вордстата и перенёс функциональность в Search API.
- **Breaking:** конфигурация теперь принимает только `WORDSTAT_API_KEY` +
  `WORDSTAT_FOLDER_ID` (переменные `WORDSTAT_FLAVOR` и `WORDSTAT_TOKEN` удалены).

## [1.0.1] — 2026-06-29

### Изменено
- `server.json`: заголовок унифицирован до «Yandex Wordstat MCP» (совпадает с H1
  README), описание сокращено до ≤100 символов; добавлен `glama.json` для листинга Glama.

## [1.0.0] — 2026-06-28

### Добавлено
- Первый релиз. MCP-сервер для Yandex Wordstat (read-only), два флейвора API
  (`cloud` / `oauth`):
  - `top_requests` — топ и семантически похожие запросы + общий объём за 30 дней;
  - `dynamics` — динамика спроса во времени (`{date, count, share}`);
  - `regions` — распределение спроса по регионам с `affinityIndex`;
  - `list_regions` — справочное дерево регионов (`id → name`);
  - `raw_request` — escape hatch на любой путь API.
- Ретраи на 429/5xx с бэкоффом (учёт `Retry-After`), таймаут запроса,
  `WordstatError(status, body)`.

[Unreleased]: https://github.com/askads/mcp-yandex-wordstat/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/askads/mcp-yandex-wordstat/releases/tag/v2.0.0
[1.0.1]: https://github.com/askads/mcp-yandex-wordstat/releases/tag/v1.0.1
[1.0.0]: https://github.com/askads/mcp-yandex-wordstat/releases/tag/v1.0.0
