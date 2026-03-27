# scripts/

Build-time validation scripts. Each runs as a standalone Node.js script during `npm run build` and exits non-zero on failure. They serve as the project's test suite.

## Scripts

- **`validate-diff-parser.ts`** - Tests `parseDiff()`, `findFirstChangedLine()`, and `textToDiff()` against single-file, multi-file, added/deleted/renamed fixtures.
- **`validate-diff-panel.ts`** - Tests `buildLineAnnotations()` and `extractLinesFromDiff()` helpers.
- **`validate-range-selection.ts`** - Tests line range normalization and formatting.
- **`validate-file-tree.ts`** - Tests `buildFileTree()` and `sortFilesForTreeOrder()`.
- **`validate-glimpse-client.ts`** - Tests `buildReviewWindowHtml()` template injection and path resolution.
- **`validate-ui-bundle.ts`** - Checks the bundled `dist/review-ui.html` for expected structure markers.
- **`smoke-annotate.ts`** - End-to-end test of the `annotate` tool using a mock `ExtensionAPI` and the stub review client. Covers request, detail, range expansion, error cases.
- **`test-glimpse.ts`** - Manual Glimpse smoke test (excluded from build, run separately). Opens a real Glimpse window with a sample diff for interactive testing.

## Adding tests

Add a new `validate-*.ts` or `smoke-*.ts` script, then add `node ./build/scripts/<name>.js` to the `build` script in `package.json`. The TypeScript is compiled to `build/scripts/` before the validation scripts run.
