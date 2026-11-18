import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { registerWordstatTools } from "./wordstat.js";

type Args = Record<string, unknown>;
type ToolConfig = { description: string; inputSchema: z.ZodRawShape };
type Handler = (args: Args) => Promise<{ content: { text: string }[]; isError?: boolean }>;

/** Fake server + fake client so the tool handlers run without network. */
function harness(opts: { throwOn?: string } = {}) {
  const calls: { method: string; params: unknown }[] = [];
  const make = (method: string) => async (params: unknown) => {
    calls.push({ method, params });
    if (opts.throwOn === method) throw new Error("boom");
    return { ok: true };
  };
  const client = {
    topRequests: make("topRequests"),
    dynamics: make("dynamics"),
    regions: make("regions"),
    regionsTree: make("regionsTree"),
  };
  const tools: Record<string, Handler> = {};
  const configs: Record<string, ToolConfig> = {};
  const server = {
    registerTool: (name: string, cfg: ToolConfig, handler: Handler) => {
      tools[name] = handler;
      configs[name] = cfg;
    },
  };
  registerWordstatTools(server as never, client as never);
  return { calls, tools, configs };
}

test("registers the four read tools", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools).sort(), ["dynamics", "list_regions", "regions", "top_requests"]);
});

test("top_requests forwards normalized params to client.topRequests", async () => {
  const { calls, tools } = harness();
  await tools.top_requests({ phrase: "кофе", regionIds: [213], devices: ["phone"], numPhrases: 10 });
  assert.equal(calls[0].method, "topRequests");
  assert.deepEqual(calls[0].params, { phrase: "кофе", regionIds: [213], devices: ["phone"], numPhrases: 10 });
});

test("regions forwards regionMode; list_regions calls regionsTree", async () => {
  const { calls, tools } = harness();
  await tools.regions({ phrase: "кофе", regionMode: "cities" });
  await tools.list_regions({});
  assert.equal(calls[0].method, "regions");
  assert.deepEqual(calls[0].params, { phrase: "кофе", regionMode: "cities" });
  assert.equal(calls[1].method, "regionsTree");
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "dynamics" });
  const res = await tools.dynamics({ phrase: "кофе" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});

// The Search API has no defaults here: a request without `period` or `fromDate`
// answers 400 "period: Field is required / from_date: Field is required"
// (checked live 2026-11-18). The schema must say so before the call is made.
test("dynamics requires period and fromDate, toDate stays optional", () => {
  const { configs } = harness();
  const schema = z.object(configs.dynamics.inputSchema);
  const full = { phrase: "кофе", period: "monthly", fromDate: "2026-08-01T00:00:00Z" };
  assert.equal(schema.safeParse(full).success, true);
  assert.equal(schema.safeParse({ ...full, toDate: "2026-10-31T00:00:00Z" }).success, true);
  assert.equal(schema.safeParse({ phrase: "кофе", fromDate: full.fromDate }).success, false);
  assert.equal(schema.safeParse({ phrase: "кофе", period: "monthly" }).success, false);
});

// Telemetry, week to 2026-11-17: nine installs hit "The to field value should be
// the last day of the month" and found the date by trial. The rules the API
// enforces have to be readable before the first call.
test("dynamics spells out the date alignment rules the API enforces", () => {
  const { configs } = harness();
  const shape = configs.dynamics.inputSchema as Record<string, z.ZodTypeAny>;
  for (const text of [configs.dynamics.description, shape.toDate.description ?? ""]) {
    assert.match(text, /последний день месяца/);
    assert.match(text, /воскресенье/);
  }
  assert.match(shape.fromDate.description ?? "", /первое число месяца/);
  assert.match(shape.fromDate.description ?? "", /понедельник/);
  assert.match(shape.fromDate.description ?? "", /60 дней/);
  assert.match(configs.dynamics.description, /UTC/);
});
