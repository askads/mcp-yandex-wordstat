// Законсервированный Yandex Cloud Search API (Wordstat) для README-демо: патчит
// глобальный fetch, так что настоящий код сервера проходит весь свой путь
// (Api-Key-заголовок, folderId в теле, ретраи, парсинг), но ни один байт не уходит
// в сеть. Подключается в процесс сервера через NODE_OPTIONS=--import из
// docs/demo/run.mjs; продовый код не меняется. Формы ответов — из
// wordstat_service.proto (int64 → строки, Timestamp → RFC3339, double → числа);
// цифры согласованы со сценарием в run.mjs.

// top_requests: запросы, СОДЕРЖАЩИЕ фразу (results), похожие по смыслу
// (associations) и totalCount за последние 30 дней. Первая строка results —
// сама фраза, её count = totalCount.
const TOP = {
  totalCount: "598420",
  results: [
    { phrase: "купить велосипед", count: "598420" },
    { phrase: "купить велосипед взрослый", count: "84310" },
    { phrase: "купить детский велосипед", count: "61540" },
    { phrase: "купить велосипед недорого", count: "37280" },
    { phrase: "купить велосипед бу", count: "29450" },
  ],
  associations: [
    { phrase: "электровелосипед", count: "96140" },
    { phrase: "велосипед цена", count: "45620" },
    { phrase: "купить велик", count: "21870" },
  ],
};

// dynamics за 12 месяцев (PERIOD_MONTHLY): выраженная сезонность с пиком
// апрель–июнь и зимним дном в январе (611 580 / 141 050 ≈ 4,3 раза). Июнь
// (604 480) согласован с totalCount за последние 30 дней (598 420 — окно
// сдвинуто на несколько дней). share = доля от всех запросов к Яндексу.
const MONTHS = [
  ["2025-07", 512340],
  ["2025-08", 428760],
  ["2025-09", 271480],
  ["2025-10", 194230],
  ["2025-11", 163870],
  ["2025-12", 148920],
  ["2026-01", 141050],
  ["2026-02", 176340],
  ["2026-03", 294860],
  ["2026-04", 517230],
  ["2026-05", 611580],
  ["2026-06", 604480],
];

const DYNAMICS = {
  results: MONTHS.map(([month, count]) => ({
    date: `${month}-01T00:00:00Z`,
    count: String(count),
    share: Number((count / 9.2e9).toPrecision(3)),
  })),
};

// regions (REGION_CITIES): affinityIndex = share региона / share по стране
// (базовая доля 0.0008) в процентах. Москва даёт максимум объёма, но индекс
// ниже среднего; лидеры по интересу — Петербург, Екатеринбург, Новосибирск.
const REGIONS = {
  results: [
    { region: "213", count: "71210", share: 0.000774, affinityIndex: 96.8 },
    { region: "2", count: "52840", share: 0.001186, affinityIndex: 148.2 },
    { region: "54", count: "21470", share: 0.001061, affinityIndex: 132.6 },
    { region: "65", count: "18930", share: 0.000971, affinityIndex: 121.4 },
  ],
};

function json(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));

  if (url.host === "searchapi.api.cloud.yandex.net") {
    if (url.pathname === "/v2/wordstat/topRequests") return json(TOP);
    if (url.pathname === "/v2/wordstat/dynamics") return json(DYNAMICS);
    if (url.pathname === "/v2/wordstat/regions") return json(REGIONS);
    // Не замоканный путь → 400 (клиент его не ретраит): сервер отдаст обычный
    // tool-error, и если сценарий demo уехал от фикстур, это видно сразу, а в
    // реальную сеть запрос не уходит.
    return new Response(
      JSON.stringify({ code: 3, message: `Not mocked in demo: ${url.pathname}` }),
      { status: 400, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }

  return realFetch(input, init);
};
