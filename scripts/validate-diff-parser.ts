import assert from "node:assert/strict";
import { findFirstChangedLine, parseDiff, textToDiff } from "../src/diff-parser.js";

const singleFileDiff = `diff --git a/src/example.ts b/src/example.ts
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

const multiFileDiff = `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,2 @@
+export const created = true;
+export const count = 1;
diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 98%
rename from src/old-name.ts
rename to src/new-name.ts
diff --git a/src/deleted.ts b/src/deleted.ts
deleted file mode 100644
index abcdef0..0000000
--- a/src/deleted.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const removed = true;
-export const id = 1;
`;

const singleFile = parseDiff(singleFileDiff);
assert.equal(singleFile.length, 1, "single-file diff should produce one file");
assert.equal(singleFile[0].oldPath, "src/example.ts");
assert.equal(singleFile[0].newPath, "src/example.ts");
assert.equal(singleFile[0].displayPath, "src/example.ts");
assert.equal(singleFile[0].changeType, "modified");
assert.equal(singleFile[0].additions, 2);
assert.equal(singleFile[0].deletions, 1);
assert.equal(singleFile[0].hunks.length, 1);
assert.deepEqual(findFirstChangedLine(singleFile[0]), { lineNumber: 2, lineSource: "new" });

const files = parseDiff(multiFileDiff);
assert.equal(files.length, 3, "multi-file diff should produce three files");

assert.equal(files[0].changeType, "added");
assert.equal(files[0].oldPath, "/dev/null");
assert.equal(files[0].newPath, "src/new-file.ts");
assert.equal(files[0].displayPath, "src/new-file.ts");
assert.equal(files[0].additions, 2);
assert.equal(files[0].deletions, 0);
assert.deepEqual(findFirstChangedLine(files[0]), { lineNumber: 1, lineSource: "new" });

assert.equal(files[1].changeType, "renamed");
assert.equal(files[1].oldPath, "src/old-name.ts");
assert.equal(files[1].newPath, "src/new-name.ts");
assert.equal(files[1].displayPath, "src/new-name.ts");
assert.equal(files[1].hunks.length, 0);

assert.equal(files[2].changeType, "deleted");
assert.equal(files[2].oldPath, "src/deleted.ts");
assert.equal(files[2].newPath, "/dev/null");
assert.equal(files[2].displayPath, "src/deleted.ts");
assert.equal(files[2].additions, 0);
assert.equal(files[2].deletions, 2);
assert.deepEqual(findFirstChangedLine(files[2]), { lineNumber: 1, lineSource: "old" });

// textToDiff validation
const textContent = "line one\nline two\nline three";
const syntheticDiff = textToDiff(textContent, "test-file.txt");
const syntheticFiles = parseDiff(syntheticDiff);
assert.equal(syntheticFiles.length, 1, "textToDiff should produce one file");
assert.equal(syntheticFiles[0].changeType, "added");
assert.equal(syntheticFiles[0].oldPath, "/dev/null");
assert.equal(syntheticFiles[0].newPath, "test-file.txt");
assert.equal(syntheticFiles[0].displayPath, "test-file.txt");
assert.equal(syntheticFiles[0].additions, 3);
assert.equal(syntheticFiles[0].deletions, 0);
assert.equal(syntheticFiles[0].hunks.length, 1);
assert.equal(syntheticFiles[0].hunks[0].lines.length, 3);
assert.equal(syntheticFiles[0].hunks[0].lines[0].text, "line one");
assert.equal(syntheticFiles[0].hunks[0].lines[0].kind, "add");
assert.equal(syntheticFiles[0].hunks[0].lines[0].newLineNumber, 1);

// textToDiff with default filename
const defaultDiff = textToDiff("hello");
const defaultFiles = parseDiff(defaultDiff);
assert.equal(defaultFiles[0].displayPath, "review-content");

// textToDiff with empty content
const emptyDiff = textToDiff("");
const emptyFiles = parseDiff(emptyDiff);
assert.equal(emptyFiles.length, 1);
assert.equal(emptyFiles[0].additions, 1, "empty content produces one empty add line");

console.log("Diff parser validation passed.");
