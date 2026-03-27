import { useMemo, useState } from "react";
import { type DiffModeEnum, DiffView, SplitSide } from "@git-diff-view/react";
import { highlighter } from "@git-diff-view/lowlight";
import type { DiffAnnotation, DiffAnnotationDraft, DiffAnnotationLineSource, ReviewFile } from "../types.js";
import { buildDiffExtendData, createDiffViewFile } from "./diff-panel-helpers.js";
import { CommentForm } from "./CommentForm.js";
import { CommentThread } from "./CommentThread.js";
import { DiffErrorBoundary } from "./DiffErrorBoundary.js";
import { createSingleLineSelection, formatSelectionLabel, resolveRangeSelection, type RangeAnchor, type RangeSelection } from "./range-selection.js";

interface DiffPanelProps {
  file: ReviewFile;
  annotations: DiffAnnotation[];
  diffMode: DiffModeEnum;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isViewed: boolean;
  onToggleViewed: () => void;
  shiftKeyHeld: boolean;
  rangeAnchor: RangeAnchor | null;
  onRangeAnchorChange: (anchor: RangeAnchor | null) => void;
  onAddAnnotation: (draft: DiffAnnotationDraft) => void;
  onUpdateAnnotation: (annotationId: string, comment: string) => void;
  onDeleteAnnotation: (annotationId: string) => void;
}

export function DiffPanel({
  file,
  annotations,
  diffMode,
  collapsed,
  onToggleCollapse,
  isViewed,
  onToggleViewed,
  shiftKeyHeld,
  rangeAnchor,
  onRangeAnchorChange,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation
}: DiffPanelProps) {
  const [widgetSelection, setWidgetSelection] = useState<RangeSelection | null>(null);

  const diffFile = useMemo(() => createDiffViewFile(file), [file]);
  const extendData = useMemo(() => buildDiffExtendData(annotations), [annotations]);
  const anchorLabel = rangeAnchor ? `${rangeAnchor.lineSource === "old" ? "Old" : "New"} line ${rangeAnchor.lineNumber}` : null;

  return (
    <section className="review-panel review-panel--diff">
      <div className="review-panel__header review-panel__header--sticky">
        <div className="review-panel__header-left">
          <button type="button" className="diff-panel__collapse-btn" onClick={onToggleCollapse} aria-label={collapsed ? "Expand file" : "Collapse file"}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              {collapsed
                ? <path d="M6.427 4.427a.25.25 0 0 1 .354 0l3.396 3.396a.25.25 0 0 1 0 .354l-3.396 3.396a.25.25 0 0 1-.354-.354L9.646 8 6.427 4.781a.25.25 0 0 1 0-.354Z" />
                : <path d="M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.939l3.72-3.719a.749.749 0 0 1 1.06 0Z" />
              }
            </svg>
          </button>
          <div>
            <div className="review-panel__title">{file.displayPath}</div>
            <div className="review-panel__meta">
              +{file.additions} additions · -{file.deletions} deletions · {annotations.length} annotation{annotations.length === 1 ? "" : "s"}
              {anchorLabel ? ` · anchor ${anchorLabel}` : ""}
            </div>
          </div>
        </div>
        <label className="diff-panel__viewed-toggle" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={isViewed} onChange={onToggleViewed} />
          Viewed
        </label>
      </div>
      {!collapsed && <div className="review-panel__body review-panel__body--diff">
        <DiffErrorBoundary fallback={<DiffRenderFallback file={file} />}>
          <DiffView
            diffFile={diffFile}
            diffViewMode={diffMode}
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
              onRangeAnchorChange(next.nextAnchor);
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
                    onRangeAnchorChange(null);
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
        </DiffErrorBoundary>
      </div>}
    </section>
  );
}

function DiffRenderFallback({ file }: { file: ReviewFile }) {
  return (
    <div>
      <div className="review-hint">Diff rendering failed. Falling back to raw diff output for this file.</div>
      <pre className="review-code">{file.rawDiff}</pre>
    </div>
  );
}

function toLineSource(side: SplitSide): DiffAnnotationLineSource {
  return side === SplitSide.old ? "old" : "new";
}
