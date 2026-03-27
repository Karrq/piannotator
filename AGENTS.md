# Agents

Piannotator is a pi extension that adds a visual code review tool. It registers an `annotate` tool and `/annotate` slash command that open a native macOS diff review UI via Glimpse.

## Project structure

```
src/
  index.ts              # Extension entry point - tool/command registration, state management
  types.ts              # All shared types (ReviewFile, Annotation, bridge messages)
  diff-parser.ts        # Unified diff parser (text -> structured files/hunks/lines)
  review-client.ts      # ReviewClient interface
  review-client-glimpse.ts  # Glimpse-backed implementation (native window)
  review-client-stub.ts     # Deterministic stub for testing
  ui/                   # React app rendered in the Glimpse window
scripts/                # Build-time validations and smoke tests
esbuild.config.ts       # Bundles the React UI into a single HTML file
```

## Build

`npm run build` compiles TypeScript, runs all validation scripts, and bundles the UI. The validation scripts act as the test suite - they run as part of every build.

## Key patterns

- **ReviewClient abstraction**: `review-client.ts` defines the interface. Implementations handle opening the UI and returning annotations. `PIANNOTATOR_REVIEW_CLIENT=stub` selects the stub for testing.
- **Session state reconstruction**: Reviews are stored in tool result `details` and custom message `details`. On session start/switch/fork, state is rebuilt by replaying the session branch.
- **Bridge protocol**: The extension and UI communicate via `ReviewBridgeInit` (extension -> UI) and `ReviewBridgeMessage` (UI -> extension). Messages include submit, cancel, and rerun.
- **Full-context diffs**: Shell commands are wrapped with `git -c diff.context=999999999` / `jj --config 'diff.git.context=999999999'` so collapsed regions contain real file content.

## Testing

There are no separate test files. Validation scripts in `scripts/` run during build:

- `validate-diff-parser.ts` - diff parsing with assertions
- `validate-diff-panel.ts` - diff panel helper functions
- `validate-range-selection.ts` - line range selection logic
- `validate-file-tree.ts` - file tree data construction
- `validate-glimpse-client.ts` - HTML template building
- `validate-ui-bundle.ts` - bundled HTML structure
- `smoke-annotate.ts` - end-to-end tool flow using the stub client
