import assert from "node:assert/strict";
import { parseDiff } from "../src/diff-parser.js";
import { materializeAnnotations } from "../src/ui/annotation-state.js";
import { buildDiffExtendData, createDiffViewFile } from "../src/ui/diff-panel-helpers.js";

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

const files = parseDiff(diffFixture);
assert.equal(files.length, 1, "expected one parsed diff file");

const diffViewFile = createDiffViewFile(files[0]);
assert.ok(diffViewFile.unifiedLineLength > 0, "diff view file should have unified lines");
assert.equal(diffViewFile.additionLength, 2, "diff view file should track additions");
assert.equal(diffViewFile.deletionLength, 1, "diff view file should track deletions");

const { annotations } = materializeAnnotations([
  {
    kind: "diff",
    filePath: "src/example.ts",
    lineStart: 2,
    lineSource: "new",
    comment: "Review this refactor"
  }
]);
const diffAnnotations = annotations.filter((annotation) => annotation.kind === "diff");
const extendData = buildDiffExtendData(diffAnnotations);

assert.ok(extendData.newFile, "newFile extend data should exist");
assert.equal(extendData.newFile?.["2"]?.data.comments.length, 1, "line 2 should have one inline thread");
assert.equal(extendData.newFile?.["2"]?.data.comments[0].comment, "Review this refactor");

console.log("Diff panel validation passed.");
