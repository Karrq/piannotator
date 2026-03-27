import assert from "node:assert/strict";
import { buildFileTree, sortFilesForTreeOrder } from "../src/ui/file-tree-data.js";
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
  { id: "A1", summary: "", filePath: "src/a.ts", lineSource: "new", lineStart: 3, comment: "note" },
  { id: "A2", summary: "", filePath: "src/utils/math.ts", lineSource: "new", lineStart: 5, comment: "note" }
]);

assert.equal(tree.length, 1, "expected one top-level directory");
assert.equal(tree[0].kind, "directory");
assert.equal(tree[0].name, "src");
assert.equal(tree[0].annotationCount, 2);
assert.equal(tree[0].children?.length, 2);
assert.equal(tree[0].children?.[0].name, "utils");
assert.equal(tree[0].children?.[1].name, "a.ts");

const orderedFiles = sortFilesForTreeOrder([
  {
    ...files[0],
    oldPath: "z.ts",
    newPath: "z.ts",
    displayPath: "z.ts"
  },
  {
    ...files[0],
    oldPath: "src/index.ts",
    newPath: "src/index.ts",
    displayPath: "src/index.ts"
  },
  {
    ...files[0],
    oldPath: "src/utils/math.ts",
    newPath: "src/utils/math.ts",
    displayPath: "src/utils/math.ts"
  }
]);

assert.deepEqual(
  orderedFiles.map((file) => file.displayPath),
  ["src/utils/math.ts", "src/index.ts", "z.ts"],
  "expected diff panels to follow the same directory-first ordering as the tree"
);

console.log("File tree validation passed.");
