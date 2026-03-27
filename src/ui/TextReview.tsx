import { useEffect, useMemo, useState } from "react";
import { normalizeRange, type Annotation, type TextAnnotation, type TextAnnotationDraft } from "../types.js";
import { CommentForm } from "./CommentForm.js";
import { CommentThread } from "./CommentThread.js";
import { buildTextThreadMap, isTextLineAnnotated } from "./text-review-helpers.js";

interface TextReviewProps {
  content: string;
  annotations: Annotation[];
  onAddAnnotation: (draft: TextAnnotationDraft) => void;
  onUpdateAnnotation: (annotationId: string, comment: string) => void;
  onDeleteAnnotation: (annotationId: string) => void;
}

interface TextRangeAnchor {
  lineNumber: number;
}

interface TextEditorSelection {
  clickedLineNumber: number;
  lineStart: number;
  lineEnd?: number;
}

export function TextReview({ content, annotations, onAddAnnotation, onUpdateAnnotation, onDeleteAnnotation }: TextReviewProps) {
  const [shiftKeyHeld, setShiftKeyHeld] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState<TextRangeAnchor | null>(null);
  const [editorSelection, setEditorSelection] = useState<TextEditorSelection | null>(null);

  const lines = useMemo(() => content.split(/\r?\n/), [content]);
  const textAnnotations = annotations.filter((annotation): annotation is TextAnnotation => annotation.kind === "text");
  const threadMap = useMemo(() => buildTextThreadMap(textAnnotations), [textAnnotations]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setShiftKeyHeld(true);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setShiftKeyHeld(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <div>
          <div className="review-panel__title">Text review</div>
          <div className="review-panel__meta">
            {lines.length} line{lines.length === 1 ? "" : "s"} · {textAnnotations.length} annotation{textAnnotations.length === 1 ? "" : "s"}
            {rangeAnchor ? ` · anchor line ${rangeAnchor.lineNumber}` : ""}
          </div>
        </div>
      </div>
      <div className="review-panel__body review-panel__body--text">
        <div className="review-hint">
          Click the line button to comment. Hold Shift and click another line to turn the active anchor into a range.
        </div>
        <div className="text-review">
          {lines.map((line, index) => {
            const lineNumber = index + 1;
            const currentSelection =
              editorSelection && editorSelection.clickedLineNumber === lineNumber ? editorSelection : null;
            const activeRange = currentSelection ?? (rangeAnchor ? { lineStart: rangeAnchor.lineNumber, lineEnd: undefined } : null);
            const isSelected =
              activeRange !== null &&
              lineNumber >= activeRange.lineStart &&
              lineNumber <= (activeRange.lineEnd ?? activeRange.lineStart);
            const isAnnotated = isTextLineAnnotated(textAnnotations, lineNumber);
            const threads = threadMap.get(lineNumber) ?? [];

            return (
              <div key={lineNumber} className="text-review__line-group">
                <div
                  className={`text-review__line ${isAnnotated ? "text-review__line--annotated" : ""} ${isSelected ? "text-review__line--selected" : ""}`}
                >
                  <button
                    type="button"
                    className="text-review__add"
                    onClick={() => {
                      const nextSelection = resolveTextSelection(rangeAnchor, lineNumber, shiftKeyHeld);
                      setRangeAnchor({ lineNumber: nextSelection.lineStart });
                      setEditorSelection({ clickedLineNumber: lineNumber, ...nextSelection });
                    }}
                    aria-label={`Add comment on line ${lineNumber}`}
                  >
                    +
                  </button>
                  <span className="review-code__line-number">{lineNumber}</span>
                  <span className="text-review__line-text">{line}</span>
                </div>
                {currentSelection ? (
                  <CommentForm
                    label={formatSelectionLabel(currentSelection.lineStart, currentSelection.lineEnd)}
                    onCancel={() => setEditorSelection(null)}
                    onSubmit={(comment) => {
                      onAddAnnotation({
                        kind: "text",
                        lineSource: "text",
                        lineStart: currentSelection.lineStart,
                        lineEnd: currentSelection.lineEnd,
                        comment
                      });
                      setRangeAnchor(null);
                      setEditorSelection(null);
                    }}
                  />
                ) : null}
                {threads.length > 0 ? (
                  <CommentThread comments={threads} onUpdateComment={onUpdateAnnotation} onDeleteComment={onDeleteAnnotation} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function resolveTextSelection(anchor: TextRangeAnchor | null, clickedLineNumber: number, shiftKeyHeld: boolean): Omit<TextEditorSelection, "clickedLineNumber"> {
  if (shiftKeyHeld && anchor) {
    const normalized = normalizeRange(anchor.lineNumber, clickedLineNumber);
    return {
      lineStart: normalized.lineStart,
      lineEnd: normalized.lineEnd
    };
  }

  return {
    lineStart: clickedLineNumber
  };
}

function formatSelectionLabel(lineStart: number, lineEnd?: number): string {
  return lineEnd === undefined ? `Line ${lineStart}` : `Lines ${lineStart}-${lineEnd}`;
}
