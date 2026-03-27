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
  async exec(_command: string, args: string[]) {
    const shellCommand = args[1];
    if (shellCommand === "emit-diff") {
      return { stdout: diffFixture, stderr: "", code: 0 };
    }

    if (shellCommand === "emit-stderr") {
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

const ctx = {
  sessionManager: {
    getBranch() {
      return [];
    }
  }
};

const textRequest = await annotateTool.execute(
  "tool-call-1",
  { action: "request", content: "first line\nsecond line" },
  undefined,
  undefined,
  ctx
);
assert.match(textRequest.content[0].text, /Review review-1/);
assert.equal(textRequest.details.review.id, "review-1");
assert.equal(textRequest.details.review.mode, "text");
assert.equal(textRequest.details.review.annotations.length, 1);
assert.equal(textRequest.details.review.annotations[0].id, "A1");
assert.equal(textRequest.details.review.annotations[0].kind, "text");
assert.equal(textRequest.details.review.annotations[0].lineStart, 1);

const textOverview = await annotateTool.execute(
  "tool-call-2",
  { action: "overview", reviewId: "review-1" },
  undefined,
  undefined,
  ctx
);
assert.match(textOverview.content[0].text, /A1: L1/);

const textDetail = await annotateTool.execute(
  "tool-call-3",
  { action: "detail", reviewId: "review-1", annotationId: "A1" },
  undefined,
  undefined,
  ctx
);
assert.match(textDetail.content[0].text, /Annotation A1 in L1/);
assert.match(textDetail.content[0].text, /Comment:/);

const diffRequest = await annotateTool.execute(
  "tool-call-4",
  { action: "request", command: "emit-diff" },
  undefined,
  undefined,
  ctx
);
assert.match(diffRequest.content[0].text, /Review review-2/);
assert.equal(diffRequest.details.review.id, "review-2");
assert.equal(diffRequest.details.review.mode, "diff");
assert.equal(diffRequest.details.review.files.length, 1);
assert.equal(diffRequest.details.review.annotations.length, 1);
assert.equal(diffRequest.details.review.annotations[0].kind, "diff");
assert.equal(diffRequest.details.review.annotations[0].filePath, "src/example.ts");

const diffOverview = await annotateTool.execute(
  "tool-call-5",
  { action: "overview", reviewId: "review-2" },
  undefined,
  undefined,
  ctx
);
assert.match(diffOverview.content[0].text, /src\/example.ts:/);

const diffDetail = await annotateTool.execute(
  "tool-call-6",
  { action: "detail", reviewId: "review-2", annotationId: "A1" },
  undefined,
  undefined,
  ctx
);
assert.match(diffDetail.content[0].text, /Annotation A1 in src\/example.ts:/);
assert.match(diffDetail.content[0].text, /Context \(@@ -1,4 \+1,5 @@\):/);

const stderrRequest = await annotateTool.execute(
  "tool-call-7",
  { action: "request", command: "emit-stderr" },
  undefined,
  undefined,
  ctx
);
assert.match(stderrRequest.details.review.source.content, /^\[stderr\]\nonly stderr$/);

console.log("Annotate stub smoke test passed.");
