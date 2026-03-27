import assert from "node:assert/strict";
import { parseDiff } from "../src/diff-parser.js";
import { materializeAnnotations } from "../src/ui/annotation-state.js";
import { buildLineAnnotations } from "../src/ui/diff-panel-helpers.js";

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
assert.equal(files[0].additions, 2, "file should have 2 additions");
assert.equal(files[0].deletions, 1, "file should have 1 deletion");

const { annotations } = materializeAnnotations([
  {
    filePath: "src/example.ts",
    lineStart: 2,
    lineSource: "new",
    comment: "Review this refactor"
  }
]);

const lineAnnotations = buildLineAnnotations(annotations);
assert.equal(lineAnnotations.length, 1, "should have one line annotation");
assert.equal(lineAnnotations[0].side, "additions", "annotation on new file should map to additions");
assert.equal(lineAnnotations[0].lineNumber, 2, "line number should be preserved");
assert.equal(lineAnnotations[0].metadata.comment, "Review this refactor", "comment should be preserved");

console.log("Diff panel validation passed.");
