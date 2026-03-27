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

## Similar tools

- [Lumen](https://github.com/jnsahaj/lumen) is a terminal diff viewer with strong keyboard-driven review, annotations, and export or copy flows for composing the review elsewhere; I only found it after starting Piannotator, and if I had seen it earlier I might have explored integrating it into pi via a slash command or agent tool instead.
- [Hunk](https://github.com/modem-dev/hunk/) is aimed at agent-authored changesets and supports inline agent or AI annotations, so it is mainly about the agent surfacing review context to the human rather than the human sending structured review feedback back into the agent.
- [Plannotator](https://github.com/backnotprop/plannotator) was a direct inspiration, especially around visual annotation for agent workflows, but its documented Pi code review flow is centered on `/plannotator-review` over current git changes in a browser UI, while Piannotator is built around arbitrary diff commands returned to pi as structured tool output.
- [pi-annotated-reply](https://github.com/omaclaren/pi-annotated-reply) takes a text and editor-first approach, loading annotated versions of the last reply, a file, or the current git diff into pi's editor, while Piannotator prefers a single visual diff review flow over inline annotation syntax and many command variants.

## License

MIT
