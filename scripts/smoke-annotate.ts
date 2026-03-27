import assert from "node:assert/strict";
import annotateExtension from "../src/index.js";

process.env.PIANNOTATOR_REVIEW_CLIENT = "stub";

const diffFixture = `diff --git a/src/example.ts b/src/example.ts
index 1111111..2222222 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,4 +1,5 @@
 export function sum(a: number, b: number) {
-  return a + b;
+  const total = a + b;
+  return total;
 }
`;

type ToolDefinition = {
  name: string;
  parameters?: any;
  execute: (...args: any[]) => Promise<any>;
};

const tools = new Map<string, ToolDefinition>();
const handlers = new Map<string, Array<(...args: any[]) => any>>();

const api = {
  on(event: string, handler: (...args: any[]) => any) {
    const list = handlers.get(event) ?? [];
    list.push(handler);
    handlers.set(event, list);
  },
  registerTool(tool: ToolDefinition) {
    tools.set(tool.name, tool);
  },
  registerCommand(_name: string, _options: any) {},
  registerMessageRenderer(_customType: string, _renderer: any) {},
  async exec(_command: string, args: string[]) {
    const shellCommand = args[1];
    // Commands may be wrapped with full-context preamble (git/jj function overrides)
    const unwrapped = shellCommand.replace(/^.*?;\s*(?=\S)/, "").replace(/^.*?;\s*(?=\S)/, "").replace(/^.*?;\s*/, "");
    if (unwrapped === "emit-diff" || shellCommand.endsWith("emit-diff")) {
      return { stdout: diffFixture, stderr: "", code: 0 };
    }

    if (unwrapped === "emit-stderr" || shellCommand.endsWith("emit-stderr")) {
      return { stdout: "", stderr: "only stderr", code: 1 };
    }

    throw new Error(`Unexpected exec command in smoke test: ${shellCommand}`);
  }
};

annotateExtension(api as any);

const annotateTool = tools.get("annotate");
if (!annotateTool) {
  throw new Error("annotate tool was not registered");
}

assert.equal(annotateTool.parameters?.type, "object");
assert.deepEqual(annotateTool.parameters?.properties?.action?.enum, ["request", "detail"]);

const ctx = {
  sessionManager: {
    getBranch() {
      return [];
    }
  }
};

// Diff command request
const diffRequest = await annotateTool.execute(
  "tool-call-1",
  { action: "request", command: "emit-diff" },
  undefined,
  undefined,
  ctx
);
assert.match(diffRequest.content[0].text, /Review review-1/);
assert.equal(diffRequest.details.review.id, "review-1");
assert.equal(diffRequest.details.review.annotations.length, 1);
assert.equal(diffRequest.details.review.annotations[0].filePath, "src/example.ts");
assert.equal(diffRequest.details.review.versions.length, 1);
assert.equal(diffRequest.details.review.versions[0].files.length, 1);

// Verify request result includes diff annotation overview
assert.match(diffRequest.content[0].text, /Version 1/);
assert.match(diffRequest.content[0].text, /src\/example.ts:/);

// Detail lookup - single ID
const diffDetail = await annotateTool.execute(
  "tool-call-2",
  { action: "detail", reviewId: "review-1", annotationIds: ["A1"] },
  undefined,
  undefined,
  ctx
);
assert.match(diffDetail.content[0].text, /Annotation A1 in src\/example.ts:/);
assert.match(diffDetail.content[0].text, /Context \(@@ -1,4 \+1,5 @@\):/);

// Detail lookup - missing ID is noted inline
const missingDetail = await annotateTool.execute(
  "tool-call-2b",
  { action: "detail", reviewId: "review-1", annotationIds: ["A1", "A99"] },
  undefined,
  undefined,
  ctx
);
assert.match(missingDetail.content[0].text, /Annotation A1 in src\/example.ts:/);
assert.match(missingDetail.content[0].text, /Annotation A99 was not found/);

// Detail lookup - range expansion
const rangeDetail = await annotateTool.execute(
  "tool-call-2c",
  { action: "detail", reviewId: "review-1", annotationIds: ["A1..A1"] },
  undefined,
  undefined,
  ctx
);
assert.match(rangeDetail.content[0].text, /Annotation A1 in src\/example.ts:/);

// Stderr-only command
const stderrRequest = await annotateTool.execute(
  "tool-call-3",
  { action: "request", command: "emit-stderr" },
  undefined,
  undefined,
  ctx
);
assert.match(stderrRequest.details.review.source.content, /^\[stderr\]\nonly stderr$/);

// Missing command
const noCommandRequest = await annotateTool.execute(
  "tool-call-4",
  { action: "request" },
  undefined,
  undefined,
  ctx
);
assert.equal(noCommandRequest.details.error, "annotate.request requires a command.");

console.log("Annotate stub smoke test passed.");
