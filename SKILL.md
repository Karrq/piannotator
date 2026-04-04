---
name: piannotator
description: Open a visual code review UI in the browser for annotating diffs. Use when the user wants to review code changes, annotate a diff, or do a visual code review. Use this skill whenever the user mentions reviewing code, checking changes, looking at a diff, doing a code review, or wants to annotate or comment on code changes. Also use when the user wants visual review of modifications before committing or merging.
compatibility: Requires Node.js 18+ and npm. Works on any OS - opens review UI in your default browser.
---

# Piannotator - Visual Code Review

Opens a browser-based diff review UI where the user can annotate code changes. Annotations are returned as structured text on stdout.

## Requirements

- Node.js 18+
- npm or compatible package manager

## Install

Via [skills.sh](https://skills.sh):

```bash
npx skills add Karrq/piannotator
```

After install, build the artifacts:

```bash
npm install && npm run build
```

## Usage

```bash
node dist/review.mjs -- <diff-command>
```

The command after `--` should produce a unified diff (e.g. `git diff`, `jj diff --git`). The script automatically wraps git/jj commands for full-context diffs.

### Examples

```bash
node dist/review.mjs -- git diff HEAD      # Review uncommitted changes
node dist/review.mjs -- git diff --cached  # Review staged changes only
node dist/review.mjs -- jj diff --git      # Review jj changes
```

Prefer `git diff HEAD` over `git diff` to capture both staged and unstaged changes.
```

## Behavior

1. The script runs the diff command
2. A browser tab opens with the review UI
3. The user annotates lines and adds comments
4. On submit: annotations are printed to stdout, exit 0
5. On cancel (closing the tab or clicking cancel): exit 1, no output

## Output Format

Overall comment first (if provided), then each annotation with surrounding diff context:

```
Overall comment:
  Looks good, minor nits.

---

Annotation A1 in src/foo.ts:42

Context (@@ -40,5 +40,5 @@):
  40 | function process(data) {
  41 |   const result = transform(data);
> 42 |   return result;
  43 | }

Comment:
  Validate input first

---

Annotation A2 in src/bar.ts:10-15

Context (@@ -8,10 +8,10 @@):
   8 | const cache = new Map();
   9 |
> 10 | function lookup(key) {
> 11 |   if (cache.has(key)) {
> 12 |     return cache.get(key);
> 13 |   }
> 14 |   const value = compute(key);
> 15 |   cache.set(key, value);
  16 |   return value;
  17 | }

Comment:
  Consider adding TTL to prevent unbounded growth
```

Lines prefixed with `>` are the annotated lines. The `+`/`-`/` ` prefix indicates added/deleted/context lines in the diff.

## When to Use

- Reviewing code changes before committing or merging
- Getting user feedback on a diff
- Visual code review where inline annotations are helpful
- Any situation where the user should inspect and comment on changes
