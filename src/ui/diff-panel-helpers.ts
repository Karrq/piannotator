import type { DiffLineAnnotation, AnnotationSide } from "@pierre/diffs";
import type { Annotation, AnnotationLineSource } from "../types.js";

export function toAnnotationSide(lineSource: AnnotationLineSource): AnnotationSide {
  return lineSource === "old" ? "deletions" : "additions";
}

export function fromAnnotationSide(side: AnnotationSide): AnnotationLineSource {
  return side === "deletions" ? "old" : "new";
}

/**
 * Build one lineAnnotation entry per unique (lineNumber, side) pair.
 * Pierre renders a slot per entry, so duplicates cause repeated rendering.
 * The metadata carries the first matching annotation; renderAnnotation should
 * filter the full annotations list by position to get all of them.
 */
export function buildLineAnnotations(annotations: Annotation[]): DiffLineAnnotation<Annotation>[] {
  const seen = new Set<string>();
  const result: DiffLineAnnotation<Annotation>[] = [];
  for (const a of annotations) {
    const line = a.lineEnd ?? a.lineStart;
    const side = toAnnotationSide(a.lineSource);
    const key = `${side}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ side, lineNumber: line, metadata: a });
  }
  return result;
}

/**
 * Extract lines from a raw unified diff for a given line range and side.
 * Returns the text content of those lines, or undefined if not found.
 */
export function extractLinesFromDiff(
  rawDiff: string,
  lineStart: number,
  lineEnd: number,
  lineSource: AnnotationLineSource
): string | undefined {
  const lines = rawDiff.split("\n");
  const result: string[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // Parse hunk header to get starting line numbers
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      continue;
    }

    // Skip diff headers
    if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
      continue;
    }

    if (line.startsWith("-")) {
      if (lineSource === "old" && oldLine >= lineStart && oldLine <= lineEnd) {
        result.push(line.slice(1));
      }
      oldLine++;
    } else if (line.startsWith("+")) {
      if (lineSource === "new" && newLine >= lineStart && newLine <= lineEnd) {
        result.push(line.slice(1));
      }
      newLine++;
    } else if (line.startsWith(" ") || line === "") {
      // Context line (or empty trailing line)
      if (lineSource === "old" && oldLine >= lineStart && oldLine <= lineEnd) {
        result.push(line.startsWith(" ") ? line.slice(1) : line);
      } else if (lineSource === "new" && newLine >= lineStart && newLine <= lineEnd) {
        result.push(line.startsWith(" ") ? line.slice(1) : line);
      }
      oldLine++;
      newLine++;
    }
  }

  return result.length > 0 ? result.join("\n") : undefined;
}
