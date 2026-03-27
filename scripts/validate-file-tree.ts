import assert from "node:assert/strict";
import { buildFileTree } from "../src/ui/file-tree-data.js";
import type { ReviewFile } from "../src/types.js";

const files: ReviewFile[] = [
  {
    oldPath: "src/a.ts",
    newPath: "src/a.ts",
    displayPath: "src/a.ts",
    changeType: "modified",
    rawDiff: "",
    rawHunks: "",
    additions: 2,
    deletions: 1,
    hunks: []
  },
  {
    oldPath: "src/utils/math.ts",
    newPath: "src/utils/math.ts",
    displayPath: "src/utils/math.ts",
    changeType: "modified",
    rawDiff: "",
    rawHunks: "",
    additions: 4,
    deletions: 2,
    hunks: []
  }
];

const tree = buildFileTree(files, [
  { kind: "diff", id: "A1", summary: "", filePath: "src/a.ts", lineSource: "new", lineStart: 3, comment: "note" },
  { kind: "diff", id: "A2", summary: "", filePath: "src/utils/math.ts", lineSource: "new", lineStart: 5, comment: "note" }
]);

assert.equal(tree.length, 1, "expected one top-level directory");
assert.equal(tree[0].kind, "directory");
assert.equal(tree[0].name, "src");
assert.equal(tree[0].annotationCount, 2);
assert.equal(tree[0].children?.length, 2);
assert.equal(tree[0].children?.[0].name, "utils");
assert.equal(tree[0].children?.[1].name, "a.ts");

console.log("File tree validation passed.");
