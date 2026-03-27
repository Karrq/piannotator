# src/

Extension core. Everything outside `ui/` runs in the pi agent process (Node.js).

## Files

- **`index.ts`** - Extension factory. Registers the `annotate` tool (request/detail actions), the `/annotate` slash command, and a custom message renderer. Manages review state and reconstructs it from session history on reload. `wrapWithFullContext()` injects git/jj config for full-file diff context.

- **`types.ts`** - All shared types used by both the extension and UI. `ReviewFile`, `ReviewFileHunk`, `Annotation`, `AnnotationDraft`, and the bridge message protocol (`ReviewBridgeInit`, `ReviewBridgeMessage`, `ReviewBridgeExtensionMessage`). Keep types here to avoid circular imports.

- **`diff-parser.ts`** - Parses unified diff text into structured `ReviewFile[]`. Handles added/deleted/modified/renamed files, multi-file diffs, and hunk line numbering. `textToDiff()` converts plain text into a synthetic diff for non-diff content review. `extractDiffContext()` pulls surrounding lines for annotation detail output.

- **`review-client.ts`** - `ReviewClient` interface with a single method: `requestReview(input, options) -> ReviewClientResult | null`. Returns `null` on cancel.

- **`review-client-glimpse.ts`** - Opens a native macOS window via Glimpse. Builds a self-contained HTML file by injecting the init payload into the bundled UI template. Supports command re-runs by forwarding `rerun` bridge messages to the extension's `onRerunCommand` callback. Uses a temp file + `win.loadFile()` for reliable WKWebView reload.

- **`review-client-stub.ts`** - Returns a single annotation on the first changed line. Used for smoke tests and development without a GUI. Activated with `PIANNOTATOR_REVIEW_CLIENT=stub`.
