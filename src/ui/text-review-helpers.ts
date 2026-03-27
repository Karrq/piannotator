import type { TextAnnotation } from "../types.js";

export function buildTextThreadMap(annotations: TextAnnotation[]): Map<number, TextAnnotation[]> {
  const threadMap = new Map<number, TextAnnotation[]>();

  for (const annotation of annotations) {
    const existing = threadMap.get(annotation.lineStart) ?? [];
    existing.push(annotation);
    threadMap.set(annotation.lineStart, existing);
  }

  return threadMap;
}

export function isTextLineAnnotated(annotations: TextAnnotation[], lineNumber: number): boolean {
  return annotations.some((annotation) => {
    const lineEnd = annotation.lineEnd ?? annotation.lineStart;
    return lineNumber >= annotation.lineStart && lineNumber <= lineEnd;
  });
}
