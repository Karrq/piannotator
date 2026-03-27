import { useMemo } from "react";
import { DiffModeEnum, DiffView, SplitSide } from "@git-diff-view/react";
import { highlighter } from "@git-diff-view/lowlight";
import type { DiffAnnotation, DiffAnnotationDraft, ReviewFile } from "../types.js";
import { buildDiffExtendData, createDiffViewFile } from "./diff-panel-helpers.js";
import { CommentForm } from "./CommentForm.js";
import { CommentThread } from "./CommentThread.js";

interface DiffPanelProps {
  file: ReviewFile;
  annotations: DiffAnnotation[];
  onAddAnnotation: (draft: DiffAnnotationDraft) => void;
  onUpdateAnnotation: (annotationId: string, comment: string) => void;
  onDeleteAnnotation: (annotationId: string) => void;
}

export function DiffPanel({ file, annotations, onAddAnnotation, onUpdateAnnotation, onDeleteAnnotation }: DiffPanelProps) {
  const diffFile = useMemo(() => createDiffViewFile(file), [file]);
  const extendData = useMemo(() => buildDiffExtendData(annotations), [annotations]);

  return (
    <section className="review-panel review-panel--diff">
      <div className="review-panel__header">
        <div>
          <div className="review-panel__title">{file.displayPath}</div>
          <div className="review-panel__meta">
            +{file.additions} additions · -{file.deletions} deletions · {annotations.length} annotation{annotations.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <div className="review-panel__body review-panel__body--diff">
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
          renderWidgetLine={({ lineNumber, side, onClose }) => (
            <CommentForm
              label={`Line ${lineNumber}`}
              onCancel={onClose}
              onSubmit={(comment) => {
                onAddAnnotation({
                  kind: "diff",
                  filePath: file.displayPath,
                  lineStart: lineNumber,
                  lineSource: side === SplitSide.old ? "old" : "new",
                  comment
                });
                onClose();
              }}
            />
          )}
          renderExtendLine={({ data }) => (
            <CommentThread data={data} onUpdateComment={onUpdateAnnotation} onDeleteComment={onDeleteAnnotation} />
          )}
        />
      </div>
    </section>
  );
}
