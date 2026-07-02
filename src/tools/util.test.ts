import { test } from "node:test";
import assert from "node:assert/strict";
import { fail, ok, READ_ONLY, rfc3339Date } from "./util.js";

test("rfc3339Date accepts RFC3339 timestamps and rejects bare dates/junk", () => {
  const d = rfc3339Date(); // factory → fresh schema
  assert.equal(d.safeParse("2026-01-01T00:00:00Z").success, true);
  assert.equal(d.safeParse("2026-06-01T12:30:00+03:00").success, true);
  assert.equal(d.safeParse("2026-01-01").success, false);
  assert.equal(d.safeParse("today").success, false);
});

test("rfc3339Date is a factory returning independent schemas", () => {
  assert.notEqual(rfc3339Date(), rfc3339Date());
});

test("ok emits compact JSON; fail flags isError", () => {
  assert.equal((ok({ a: 1 }).content[0] as { text: string }).text, '{"a":1}');
  const f = fail(new Error("boom"));
  assert.equal(f.isError, true);
  assert.match((f.content[0] as { text: string }).text, /boom/);
});

test("fail appends the underlying cause when present", () => {
  const err = new Error("timeout", { cause: new Error("ECONNRESET") });
  const f = fail(err);
  assert.match((f.content[0] as { text: string }).text, /timeout \(ECONNRESET\)/);
});

test("READ_ONLY sets all four hints", () => {
  assert.deepEqual(READ_ONLY, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  });
});
