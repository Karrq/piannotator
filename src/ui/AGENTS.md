# src/ui/

React application rendered inside the Glimpse window. Bundled by esbuild into a single HTML file (`dist/review-ui.html`) at build time. Targets Safari 16+ (WKWebView).

## Architecture

The UI receives its initial data via `window.__PIANNOTATOR_INIT__` (injected by the extension before the script runs). It communicates back through `window.glimpse.send()` for submit/cancel/rerun, and receives updates via `window.__PIANNOTATOR_RECEIVE__()` for command re-runs.

## Components

- **`App.tsx`** - Root component. Manages review tabs (multi-version support), annotation CRUD, overall comment, keyboard shortcut workarounds (Cmd+C/V/X/A/Z), font settings, and the submit/cancel flow. Each tab holds its own files, annotations, and viewed/collapsed state.

- **`ReviewView.tsx`** - Layout component. Renders the file tree sidebar and the diff panel list. Handles file navigation, scroll-to-file, and intersection-based active file tracking.

- **`DiffPanel.tsx`** - Single file diff using `@pierre/diffs`. Supports unified/split mode, line selection, gutter "+" button for annotations, inline comment forms via pierre's annotation slot system, and sticky file headers. `committedSelectionRef` bridges pierre's line selection with gutter click events for multiline annotation support.

- **`FileTree.tsx`** - Collapsible sidebar with directory tree navigation. Uses `react-arborist` for virtualized tree rendering. Highlights the active file and scrolls to it on selection.

- **`ReviewBanner.tsx`** - Sticky top bar with title, tab navigation, diff mode toggle, progress circle, settings gear, and submit/cancel/clear buttons.

- **`CommentForm.tsx`** - Textarea with submit (Cmd+Enter), cancel (Escape), and a "Suggest" button that inserts a code suggestion template pre-filled with the selected lines.

- **`CommentThread.tsx`** - Renders a list of annotations at a single diff position. Supports inline edit and delete.

- **`WindowVirtualizer.tsx`** - Lightweight scroll-based virtualizer that only mounts diff panels near the viewport.

- **`ProgressCircle.tsx`** - SVG ring showing viewed/total file count.

- **`DiffErrorBoundary.tsx`** - Error boundary that catches diff rendering failures and shows the error with a stack trace.

## State helpers

- **`annotation-state.ts`** - Pure functions for annotation CRUD: materialize drafts, update comments, remove annotations, convert to bridge format.
- **`diff-panel-helpers.ts`** - `buildLineAnnotations()` maps annotations to pierre's slot system (deduplicated by position). `extractLinesFromDiff()` pulls source lines for suggestion templates.
- **`file-tree-data.ts`** - Converts flat `ReviewFile[]` into a nested tree structure for `react-arborist`.
- **`range-selection.ts`** - Line range formatting and normalization.

## Styling

`styles.css` contains all styles. The diff components use `@pierre/diffs`' built-in dark theme, extended with custom sticky header positioning and annotation card styles.
