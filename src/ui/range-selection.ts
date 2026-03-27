import { normalizeRange, type AnnotationLineSource } from "../types.js";

export interface RangeAnchor {
  lineNumber: number;
  lineSource: AnnotationLineSource;
}

export interface RangeSelection {
  clickedLineNumber: number;
  lineSource: AnnotationLineSource;
  lineStart: number;
  lineEnd?: number;
}

export function createSingleLineSelection(
  clickedLineNumber: number,
  lineSource: AnnotationLineSource
): RangeSelection {
  return {
    clickedLineNumber,
    lineSource,
    lineStart: clickedLineNumber
  };
}

export function resolveRangeSelection(
  anchor: RangeAnchor | null,
  clickedLineNumber: number,
  lineSource: AnnotationLineSource,
  shiftKeyHeld: boolean
): { nextAnchor: RangeAnchor; selection: RangeSelection } {
  if (shiftKeyHeld && anchor && anchor.lineSource === lineSource) {
    const normalized = normalizeRange(anchor.lineNumber, clickedLineNumber);
    return {
      nextAnchor: anchor,
      selection: {
        clickedLineNumber,
        lineSource,
        lineStart: normalized.lineStart,
        lineEnd: normalized.lineEnd
      }
    };
  }

  return {
    nextAnchor: { lineNumber: clickedLineNumber, lineSource },
    selection: createSingleLineSelection(clickedLineNumber, lineSource)
  };
}

export function formatSelectionLabel(selection: Pick<RangeSelection, "lineStart" | "lineEnd">): string {
  return selection.lineEnd === undefined
    ? `Line ${selection.lineStart}`
    : `Lines ${selection.lineStart}-${selection.lineEnd}`;
}
