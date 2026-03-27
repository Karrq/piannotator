import type { DiffAnnotationLineSource, DiffContextLine, ReviewFile, ReviewFileChangeType, ReviewFileHunk, ReviewFileLine } from "./types.js";

export interface FirstChangedLine {
  lineNumber: number;
  lineSource: DiffAnnotationLineSource;
}

export interface DiffContext {
  hunkHeader: string;
  lines: DiffContextLine[];
}

const DIFF_START = "diff --git ";
const NO_NEWLINE_MARKER = "\\ No newline at end of file";

export function isUnifiedDiff(content: string): boolean {
  const normalized = content.trimStart();
  return normalized.startsWith(DIFF_START) || normalized.startsWith("--- ") || normalized.startsWith("@@ ");
}

export function parseDiff(raw: string): ReviewFile[] {
  const normalized = raw.replace(/\r\n/g, "\n");
  const chunks = splitDiffChunks(normalized);
  return chunks.map((chunk) => parseDiffChunk(chunk)).filter((file): file is ReviewFile => file !== null);
}

export function findFirstChangedLine(file: ReviewFile): FirstChangedLine | null {
  let firstDeletedLine: FirstChangedLine | null = null;

  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "add" && line.newLineNumber !== undefined) {
        return { lineNumber: line.newLineNumber, lineSource: "new" };
      }

      if (!firstDeletedLine && line.kind === "del" && line.oldLineNumber !== undefined) {
        firstDeletedLine = { lineNumber: line.oldLineNumber, lineSource: "old" };
      }
    }
  }

  return firstDeletedLine;
}

export function extractDiffContext(
  file: ReviewFile,
  lineSource: DiffAnnotationLineSource,
  lineStart: number,
  lineEnd = lineStart,
  radius = 3
): DiffContext | null {
  const rangeStart = Math.min(lineStart, lineEnd);
  const rangeEnd = Math.max(lineStart, lineEnd);

  for (const hunk of file.hunks) {
    const matchIndexes = hunk.lines
      .map((line, index) => ({ index, matched: matchesLineRange(line, lineSource, rangeStart, rangeEnd) }))
      .filter((item) => item.matched)
      .map((item) => item.index);

    if (matchIndexes.length === 0) {
      continue;
    }

    const sliceStart = Math.max(0, matchIndexes[0] - radius);
    const sliceEnd = Math.min(hunk.lines.length, matchIndexes[matchIndexes.length - 1] + radius + 1);

    return {
      hunkHeader: hunk.header,
      lines: hunk.lines.slice(sliceStart, sliceEnd).map((line) => ({
        ...line,
        annotated: matchesLineRange(line, lineSource, rangeStart, rangeEnd)
      }))
    };
  }

  return null;
}

function splitDiffChunks(raw: string): string[] {
  const lines = raw.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let sawBoundary = false;

  for (const line of lines) {
    if (line.startsWith(DIFF_START)) {
      sawBoundary = true;
      if (current.length > 0) {
        chunks.push(trimTrailingEmptyLines(current).join("\n"));
      }
      current = [line];
      continue;
    }

    current.push(line);
  }

  if (current.length > 0) {
    chunks.push(trimTrailingEmptyLines(current).join("\n"));
  }

  if (sawBoundary) {
    return chunks.filter((chunk) => chunk.trim().length > 0);
  }

  return raw.trim().length === 0 ? [] : [raw.trimEnd()];
}

function parseDiffChunk(chunk: string): ReviewFile | null {
  const lines = chunk.split("\n");
  const headerLines: string[] = [];
  const rawHunkLines: string[] = [];
  const hunks: ReviewFileHunk[] = [];

  let currentHunk: ReviewFileHunk | null = null;
  let oldLineNumber = 0;
  let newLineNumber = 0;
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith("@@ ")) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }

      currentHunk = { header: line, lines: [] };
      rawHunkLines.push(line);
      const header = parseHunkHeader(line);
      oldLineNumber = header.oldStart;
      newLineNumber = header.newStart;
      continue;
    }

    if (!currentHunk) {
      headerLines.push(line);
      continue;
    }

    if (line === NO_NEWLINE_MARKER) {
      rawHunkLines.push(line);
      continue;
    }

    rawHunkLines.push(line);
    const parsedLine = parseHunkLine(line, oldLineNumber, newLineNumber);
    currentHunk.lines.push(parsedLine.line);
    oldLineNumber = parsedLine.nextOldLineNumber;
    newLineNumber = parsedLine.nextNewLineNumber;

    if (parsedLine.line.kind === "add") {
      additions += 1;
    } else if (parsedLine.line.kind === "del") {
      deletions += 1;
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  const paths = extractPaths(headerLines);
  if (!paths.oldPath && !paths.newPath) {
    return null;
  }

  const changeType = detectChangeType(headerLines, paths.oldPath, paths.newPath);
  const displayPath = changeType === "deleted" ? paths.oldPath : paths.newPath;

  return {
    oldPath: paths.oldPath,
    newPath: paths.newPath,
    displayPath,
    changeType,
    rawDiff: chunk,
    rawHunks: rawHunkLines.join("\n"),
    additions,
    deletions,
    hunks
  };
}

function parseHunkHeader(header: string): { oldStart: number; newStart: number } {
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(header);
  if (!match) {
    return { oldStart: 0, newStart: 0 };
  }

  return {
    oldStart: Number.parseInt(match[1], 10),
    newStart: Number.parseInt(match[2], 10)
  };
}

function parseHunkLine(
  line: string,
  oldLineNumber: number,
  newLineNumber: number
): { line: ReviewFileLine; nextOldLineNumber: number; nextNewLineNumber: number } {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return {
      line: {
        kind: "add",
        text: line.slice(1),
        newLineNumber
      },
      nextOldLineNumber: oldLineNumber,
      nextNewLineNumber: newLineNumber + 1
    };
  }

  if (line.startsWith("-") && !line.startsWith("---")) {
    return {
      line: {
        kind: "del",
        text: line.slice(1),
        oldLineNumber
      },
      nextOldLineNumber: oldLineNumber + 1,
      nextNewLineNumber: newLineNumber
    };
  }

  return {
    line: {
      kind: "context",
      text: line.startsWith(" ") ? line.slice(1) : line,
      oldLineNumber,
      newLineNumber
    },
    nextOldLineNumber: oldLineNumber + 1,
    nextNewLineNumber: newLineNumber + 1
  };
}

function extractPaths(headerLines: string[]): { oldPath: string; newPath: string } {
  const diffGitLine = headerLines.find((line) => line.startsWith(DIFF_START));
  let oldPath = "";
  let newPath = "";

  if (diffGitLine) {
    const match = /^diff --git a\/(.+) b\/(.+)$/.exec(diffGitLine);
    if (match) {
      oldPath = match[1];
      newPath = match[2];
    }
  }

  const oldPathLine = headerLines.find((line) => line.startsWith("--- "));
  const newPathLine = headerLines.find((line) => line.startsWith("+++ "));

  if (oldPathLine) {
    oldPath = normalizePathValue(oldPathLine.slice(4));
  }

  if (newPathLine) {
    newPath = normalizePathValue(newPathLine.slice(4));
  }

  const renameFrom = headerLines.find((line) => line.startsWith("rename from "));
  const renameTo = headerLines.find((line) => line.startsWith("rename to "));
  if (renameFrom && renameTo) {
    oldPath = renameFrom.slice("rename from ".length);
    newPath = renameTo.slice("rename to ".length);
  }

  return {
    oldPath,
    newPath
  };
}

function detectChangeType(headerLines: string[], oldPath: string, newPath: string): ReviewFileChangeType {
  if (headerLines.some((line) => line.startsWith("rename from "))) {
    return "renamed";
  }

  if (oldPath === "/dev/null" || headerLines.some((line) => line.startsWith("new file mode "))) {
    return "added";
  }

  if (newPath === "/dev/null" || headerLines.some((line) => line.startsWith("deleted file mode "))) {
    return "deleted";
  }

  return "modified";
}

function normalizePathValue(rawPath: string): string {
  if (rawPath === "/dev/null") {
    return rawPath;
  }

  return rawPath.replace(/^[ab]\//, "");
}

function trimTrailingEmptyLines(lines: string[]): string[] {
  const copy = [...lines];
  while (copy.length > 0 && copy[copy.length - 1] === "") {
    copy.pop();
  }
  return copy;
}

function matchesLineRange(
  line: ReviewFileLine,
  lineSource: DiffAnnotationLineSource,
  rangeStart: number,
  rangeEnd: number
): boolean {
  const lineNumber = lineSource === "new" ? line.newLineNumber : line.oldLineNumber;
  if (lineNumber === undefined) {
    return false;
  }

  return lineNumber >= rangeStart && lineNumber <= rangeEnd;
}

export function textToDiff(content: string, filename = "review-content"): string {
  const lines = content.split(/\r?\n/);
  const header = [
    `diff --git a/dev/null b/${filename}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${filename}`,
    `@@ -0,0 +1,${lines.length} @@`
  ];
  const body = lines.map((line) => `+${line}`);
  return [...header, ...body].join("\n");
}
