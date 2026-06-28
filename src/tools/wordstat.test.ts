import { test } from "node:test";
import assert from "node:assert/strict";
import { registerWordstatTools } from "./wordstat.js";

type Args = Record<string, unknown>;
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
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerWordstatTools(server as never, client as never);
  return { calls, tools };
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
  assert.deepEqual(calls[0].params, { phrase: "кофе", regionMode: "cities", devices: undefined });
  assert.equal(calls[1].method, "regionsTree");
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "dynamics" });
  const res = await tools.dynamics({ phrase: "кофе" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
