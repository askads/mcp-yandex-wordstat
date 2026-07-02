import { test } from "node:test";
import assert from "node:assert/strict";
import { registerWordstatTools } from "./wordstat.js";
import { registerRawTool } from "./raw.js";

interface Annotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** Registers every tool against a fake server, capturing each tool's annotations. */
function collectAnnotations(): Record<string, Annotations | undefined> {
  const annotations: Record<string, Annotations | undefined> = {};
  const server = {
    registerTool: (name: string, cfg: { annotations?: Annotations }) => {
      annotations[name] = cfg.annotations;
    },
  };
  // Registration reads the client only inside handlers, so a stub is fine here.
  registerWordstatTools(server as never, {} as never);
  registerRawTool(server as never, {} as never);
  return annotations;
}

const ANN = collectAnnotations();

test("registers all five tools with annotations", () => {
  assert.deepEqual(
    Object.keys(ANN).sort(),
    ["dynamics", "list_regions", "raw_request", "regions", "top_requests"],
  );
  for (const [name, a] of Object.entries(ANN)) {
    assert.ok(a, `${name} is missing annotations`);
  }
});

test("every tool is read-only with all four hints set", () => {
  for (const [name, a] of Object.entries(ANN)) {
    assert.equal(a?.readOnlyHint, true, `${name} should be readOnly`);
    assert.equal(a?.destructiveHint, false, `${name} should be non-destructive`);
    assert.equal(a?.idempotentHint, true, `${name} should be idempotent`);
    assert.equal(a?.openWorldHint, true, `${name} should set openWorldHint`);
  }
});
