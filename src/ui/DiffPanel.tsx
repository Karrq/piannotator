import { useEffect, useMemo, useState } from "react";
import { DiffModeEnum, DiffView, SplitSide } from "@git-diff-view/react";
import { highlighter } from "@git-diff-view/lowlight";
import type { DiffAnnotation, DiffAnnotationDraft, DiffAnnotationLineSource, ReviewFile } from "../types.js";
import { buildDiffExtendData, createDiffViewFile } from "./diff-panel-helpers.js";
import { CommentForm } from "./CommentForm.js";
import { CommentThread } from "./CommentThread.js";
import { createSingleLineSelection, formatSelectionLabel, resolveRangeSelection, type RangeAnchor, type RangeSelection } from "./range-selection.js";

interface DiffPanelProps {
  file: ReviewFile;
  annotations: DiffAnnotation[];
  onAddAnnotation: (draft: DiffAnnotationDraft) => void;
  onUpdateAnnotation: (annotationId: string, comment: string) => void;
  onDeleteAnnotation: (annotationId: string) => void;
}

export function DiffPanel({ file, annotations, onAddAnnotation, onUpdateAnnotation, onDeleteAnnotation }: DiffPanelProps) {
  const [shiftKeyHeld, setShiftKeyHeld] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState<RangeAnchor | null>(null);
  const [widgetSelection, setWidgetSelection] = useState<RangeSelection | null>(null);

  const diffFile = useMemo(() => createDiffViewFile(file), [file]);
  const extendData = useMemo(() => buildDiffExtendData(annotations), [annotations]);

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

  const anchorLabel = rangeAnchor ? `${rangeAnchor.lineSource === "old" ? "Old" : "New"} line ${rangeAnchor.lineNumber}` : null;

  return (
    <section className="review-panel review-panel--diff">
      <div className="review-panel__header">
        <div>
          <div className="review-panel__title">{file.displayPath}</div>
          <div className="review-panel__meta">
            +{file.additions} additions · -{file.deletions} deletions · {annotations.length} annotation{annotations.length === 1 ? "" : "s"}
            {anchorLabel ? ` · anchor ${anchorLabel}` : ""}
          </div>
        </div>
      </div>
      <div className="review-panel__body review-panel__body--diff">
        <div className="review-hint">
          Click the inline plus button to comment on one line. Hold Shift and click another line to turn the active anchor into a range.
        </div>
        <DiffView
          diffFile={diffFile}
          diffViewMode={DiffModeEnum.Unified}
          diffViewTheme="dark"
          diffViewWrap
          diffViewFontSize={13}
          diffViewHighlight
          diffViewAddWidget
          registerHighlighter={highlighter}
          extendData={extendData}
          onAddWidgetClick={(lineNumber, side) => {
            const lineSource = toLineSource(side);
            const next = resolveRangeSelection(rangeAnchor, lineNumber, lineSource, shiftKeyHeld);
            setRangeAnchor(next.nextAnchor);
            setWidgetSelection(next.selection);
          }}
          renderWidgetLine={({ lineNumber, side, onClose }) => {
            const lineSource = toLineSource(side);
            const selection =
              widgetSelection &&
              widgetSelection.clickedLineNumber === lineNumber &&
              widgetSelection.lineSource === lineSource
                ? widgetSelection
                : createSingleLineSelection(lineNumber, lineSource);

            return (
              <CommentForm
                label={formatSelectionLabel(selection)}
                onCancel={() => {
                  setWidgetSelection(null);
                  onClose();
                }}
                onSubmit={(comment) => {
                  onAddAnnotation({
                    kind: "diff",
                    filePath: file.displayPath,
                    lineStart: selection.lineStart,
                    lineEnd: selection.lineEnd,
                    lineSource,
                    comment
                  });
                  setRangeAnchor(null);
                  setWidgetSelection(null);
                  onClose();
                }}
              />
            );
          }}
          renderExtendLine={({ data }) => (
            <CommentThread comments={data.comments} onUpdateComment={onUpdateAnnotation} onDeleteComment={onDeleteAnnotation} />
          )}
        />
      </div>
    </section>
  );
}

function toLineSource(side: SplitSide): DiffAnnotationLineSource {
  return side === SplitSide.old ? "old" : "new";
}
