import assert from "node:assert/strict";
import { formatSelectionLabel, resolveRangeSelection } from "../src/ui/range-selection.js";

const single = resolveRangeSelection(null, 12, "new", false);
assert.deepEqual(single.nextAnchor, { lineNumber: 12, lineSource: "new" });
assert.deepEqual(single.selection, {
  clickedLineNumber: 12,
  lineSource: "new",
  lineStart: 12
});
assert.equal(formatSelectionLabel(single.selection), "Line 12");

const range = resolveRangeSelection(single.nextAnchor, 18, "new", true);
assert.deepEqual(range.selection, {
  clickedLineNumber: 18,
  lineSource: "new",
  lineStart: 12,
  lineEnd: 18
});
assert.equal(formatSelectionLabel(range.selection), "Lines 12-18");

const oppositeSide = resolveRangeSelection(single.nextAnchor, 9, "old", true);
assert.deepEqual(oppositeSide.nextAnchor, { lineNumber: 9, lineSource: "old" });
assert.deepEqual(oppositeSide.selection, {
  clickedLineNumber: 9,
  lineSource: "old",
  lineStart: 9
});

console.log("Range selection validation passed.");
