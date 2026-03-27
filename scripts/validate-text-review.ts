import assert from "node:assert/strict";
import { buildTextThreadMap, isTextLineAnnotated } from "../src/ui/text-review-helpers.js";
import type { TextAnnotation } from "../src/types.js";

const annotations: TextAnnotation[] = [
  { kind: "text", id: "A1", summary: "", lineSource: "text", lineStart: 3, comment: "single" },
  { kind: "text", id: "A2", summary: "", lineSource: "text", lineStart: 5, lineEnd: 7, comment: "range" }
];

const threadMap = buildTextThreadMap(annotations);
assert.equal(threadMap.get(3)?.length, 1);
assert.equal(threadMap.get(5)?.length, 1);
assert.equal(isTextLineAnnotated(annotations, 3), true);
assert.equal(isTextLineAnnotated(annotations, 6), true);
assert.equal(isTextLineAnnotated(annotations, 8), false);

console.log("Text review validation passed.");
