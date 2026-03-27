# Piannotator

> **Disclaimer:** This project is pure vibeslop. Code quality might be lacking, things might not make a lot of sense overall. It has been reviewed but not extensively, and definitely not by a TypeScript expert.

A [pi](https://github.com/badlogic/pi-mono) extension that adds a visual code review UI to your coding agent workflow. Annotate diffs, leave comments on specific lines, and provide structured feedback - all from a GUI window that opens alongside your terminal, powered by [Glimpse](https://github.com/hazat/glimpse) & [@pierre/diffs](https://github.com/pierrecomputer/pierre), inspired by [Plannotator](https://github.com/backnotprop/plannotator).

## What it does

Piannotator replaces text-based code review with a GitHub-style diff interface. When you (or the agent) trigger a review, a GUI window opens showing the diff with:

- **Unified and split diff views** - toggle between modes
- **Line-level annotations** - click any line to leave a comment
- **Multiline selection** - click-and-drag to annotate ranges
- **Code suggestions** - insert suggestion blocks that the agent can apply directly
- **File tree navigation** - browse changed files in a sidebar
- **Collapsible unchanged regions** - focus on what matters
- **Multi-version tabs** - re-run commands and compare across versions
- **Progress tracking** - mark files as viewed

The agent receives your annotations as structured data with file paths, line numbers, and comments - giving it precise context to act on your feedback.

## Install

```bash
pi install git:github.com/Karrq/piannotator
```

Or clone and link locally:

```bash
git clone https://github.com/Karrq/piannotator
cd piannotator
npm install
npm run build
pi install ./
```

## Usage

### As a tool (agent-driven)

The agent can call `annotate.request` with any shell command that produces a diff:

```
annotate.request with command "git diff"
```

A review window opens. You annotate, submit, and the agent gets back a structured summary:

```
Review review-1 (3 annotations):
- A1: src/index.ts:42 - "This should handle the error case"
- A2: src/utils.ts:10-15 - "```suggestion\nconst x = foo();\n```"
- A3: src/types.ts:3 - "Unused import"
```

The agent can then call `annotate.detail` to retrieve full context for any annotation.

### As a slash command

```
/annotate git diff HEAD~1
```

Opens the review UI for the given command's output. Without arguments, it opens the last assistant message for review.

### Tips

- **Cmd+Enter** submits a comment
- **Escape** cancels the current comment form
- Re-run the command from within the review to see updated diffs, or run a different command to view other parts of the codebase

## Development

```bash
npm install
npm run build    # TypeScript compile + validations + UI bundle
```

The build runs several validation scripts as part of the pipeline: diff parser, diff panel, range selection, file tree, Glimpse client, smoke test, and UI bundle validation.

For Glimpse smoke testing:

```bash
node build/scripts/test-glimpse.js
```

Set `PIANNOTATOR_REVIEW_CLIENT=stub` to use a deterministic stub client for development without opening Glimpse windows.

## License

MIT
