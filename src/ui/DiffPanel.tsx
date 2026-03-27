import { useMemo, useState } from "react";
import { type DiffModeEnum, DiffView, SplitSide } from "@git-diff-view/react";
import { ChevronDownIcon, ChevronRightIcon } from "@primer/octicons-react";
import { highlighter } from "@git-diff-view/lowlight";
import type { Annotation, AnnotationDraft, AnnotationLineSource, ReviewFile } from "../types.js";
import { buildDiffExtendData, createDiffViewFile } from "./diff-panel-helpers.js";
import { CommentForm } from "./CommentForm.js";
import { CommentThread } from "./CommentThread.js";
import { DiffErrorBoundary } from "./DiffErrorBoundary.js";
import { createSingleLineSelection, formatSelectionLabel, resolveRangeSelection, type RangeAnchor, type RangeSelection } from "./range-selection.js";

interface DiffPanelProps {
  file: ReviewFile;
  annotations: Annotation[];
  diffMode: DiffModeEnum;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isViewed: boolean;
  onToggleViewed: () => void;
  shiftKeyHeld: boolean;
  rangeAnchor: RangeAnchor | null;
  onRangeAnchorChange: (anchor: RangeAnchor | null) => void;
  onAddAnnotation: (draft: AnnotationDraft) => void;
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
            {collapsed ? <ChevronRightIcon size={16} /> : <ChevronDownIcon size={16} />}
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

function toLineSource(side: SplitSide): AnnotationLineSource {
  return side === SplitSide.old ? "old" : "new";
}
