import { useCallback, useMemo, useRef, useState } from "react";
import { FileDiff as FileDiffComponent, PatchDiff } from "@pierre/diffs/react";
import type { DiffLineAnnotation, AnnotationSide, SelectedLineRange } from "@pierre/diffs";
import { getSingularPatch, parseDiffFromFile } from "@pierre/diffs";
import { ChevronDownIcon, ChevronRightIcon } from "@primer/octicons-react";
import type { Annotation, AnnotationDraft, AnnotationLineSource, ReviewFile } from "../types.js";
import { buildLineAnnotations, extractLinesFromDiff } from "./diff-panel-helpers.js";
import { CommentForm } from "./CommentForm.js";
import { CommentThread } from "./CommentThread.js";
import { DiffErrorBoundary } from "./DiffErrorBoundary.js";
import { formatSelectionLabel, type RangeSelection } from "./range-selection.js";

type DiffStyle = "unified" | "split";

interface DiffPanelProps {
  file: ReviewFile;
  annotations: Annotation[];
  diffStyle: DiffStyle;
  diffFont?: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isViewed: boolean;
  onToggleViewed: () => void;
  onAddAnnotation: (draft: AnnotationDraft) => void;
  onUpdateAnnotation: (annotationId: string, comment: string) => void;
  onDeleteAnnotation: (annotationId: string) => void;
}

export function DiffPanel({
  file,
  annotations,
  diffStyle,
  diffFont,
  collapsed,
  onToggleCollapse,
  isViewed,
  onToggleViewed,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
}: DiffPanelProps) {
  const [widgetSelection, setWidgetSelection] = useState<RangeSelection | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);

  // Parse the full-context diff to extract old/new file contents, then
  // re-parse with parseDiffFromFile to get isPartial=false and normal-context
  // hunks. This enables expandable collapsed regions between hunks.
  const fileDiff = useMemo(() => {
    try {
      const parsed = getSingularPatch(file.rawDiff);
      if (parsed.additionLines.length === 0 && parsed.deletionLines.length === 0) return null;
      const oldContents = (parsed.deletionLines as string[]).join("");
      const newContents = (parsed.additionLines as string[]).join("");
      return parseDiffFromFile(
        { name: parsed.prevName ?? parsed.name, contents: oldContents },
        { name: parsed.name, contents: newContents },
      );
    } catch {
      return null; // fall back to PatchDiff
    }
  }, [file.rawDiff]);

  const savedLineAnnotations = useMemo(() => buildLineAnnotations(annotations), [annotations]);

  // Add a draft slot for the inline CommentForm when the widget is open,
  // but only if there isn't already an annotation slot at that position.
  const lineAnnotations = useMemo(() => {
    if (!widgetOpen || !widgetSelection) return savedLineAnnotations;
    const draftLine = widgetSelection.lineEnd ?? widgetSelection.lineStart;
    const draftSide = toSide(widgetSelection.lineSource);
    const alreadyExists = savedLineAnnotations.some(
      (a) => a.lineNumber === draftLine && a.side === draftSide
    );
    if (alreadyExists) return savedLineAnnotations;
    const draft: DiffLineAnnotation<Annotation> = {
      lineNumber: draftLine,
      side: draftSide,
      metadata: { __draft: true } as unknown as Annotation,
    };
    return [...savedLineAnnotations, draft];
  }, [savedLineAnnotations, widgetOpen, widgetSelection]);

  // Stores the last committed line selection so the gutter "+" click can adopt it.
  // onGutterUtilityClick fires before onLineSelected in pierre's pointerup handler,
  // so this ref still holds the previous selection when handleGutterClick runs.
  const committedSelectionRef = useRef<SelectedLineRange | null>(null);

  const handleLineSelected = useCallback((range: SelectedLineRange | null) => {
    committedSelectionRef.current = range;
  }, []);

  const handleGutterClick = useCallback((range: SelectedLineRange) => {
    const gutterStart = Math.min(range.start, range.end);
    const gutterEnd = Math.max(range.start, range.end);
    const isSingleLine = gutterStart === gutterEnd;

    // If "+" was clicked on a single line, check if there's an existing
    // multi-line selection that contains that line on the same side.
    const prev = committedSelectionRef.current;
    let start = gutterStart;
    let end = gutterEnd;
    let side = range.side;
    if (isSingleLine && prev && prev.start !== prev.end && prev.side === range.side) {
      const prevStart = Math.min(prev.start, prev.end);
      const prevEnd = Math.max(prev.start, prev.end);
      if (gutterStart >= prevStart && gutterStart <= prevEnd) {
        start = prevStart;
        end = prevEnd;
        side = prev.side;
      }
    }

    const lineSource: AnnotationLineSource = side === "deletions" ? "old" : "new";
    setWidgetSelection({
      clickedLineNumber: start,
      lineSource,
      lineStart: start,
      lineEnd: start === end ? undefined : end,
    });
    setWidgetOpen(true);
  }, []);

  const closeWidget = useCallback(() => {
    setWidgetOpen(false);
    setWidgetSelection(null);
  }, []);

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
            </div>
          </div>
        </div>
        <label className="diff-panel__viewed-toggle" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={isViewed} onChange={onToggleViewed} />
          Viewed
        </label>
      </div>
      {!collapsed && (
        <div className="review-panel__body review-panel__body--diff">
          <DiffErrorBoundary fallback={<DiffRenderFallback file={file} />}>
            <DiffRenderer
              fileDiff={fileDiff}
              rawDiff={file.rawDiff}
              diffFont={diffFont}
              diffStyle={diffStyle}
              handleGutterClick={handleGutterClick}
              handleLineSelected={handleLineSelected}
              lineAnnotations={lineAnnotations}
              renderAnnotation={(annotation: DiffLineAnnotation<Annotation>) => {
                const isDraftOnly = (annotation.metadata as any)?.__draft === true;
                const threadAnnotations = isDraftOnly ? [] : annotations.filter(
                  (a) => (a.lineEnd ?? a.lineStart) === annotation.lineNumber && toSide(a.lineSource) === annotation.side
                );

                // Show CommentForm inline if draft targets this position
                const draftLine = widgetSelection ? (widgetSelection.lineEnd ?? widgetSelection.lineStart) : -1;
                const draftSide = widgetSelection ? toSide(widgetSelection.lineSource) : undefined;
                const showForm = widgetOpen && annotation.lineNumber === draftLine && annotation.side === draftSide;

                if (threadAnnotations.length === 0 && !showForm) return null;
                return (
                  <>
                    {threadAnnotations.length > 0 && (
                      <CommentThread
                        comments={threadAnnotations}
                        onUpdateComment={onUpdateAnnotation}
                        onDeleteComment={onDeleteAnnotation}
                      />
                    )}
                    {showForm && widgetSelection && (
                      <CommentForm
                        label={formatSelectionLabel(widgetSelection)}
                        selectedLinesText={extractLinesFromDiff(
                          file.rawDiff,
                          widgetSelection.lineStart,
                          widgetSelection.lineEnd ?? widgetSelection.lineStart,
                          widgetSelection.lineSource
                        )}
                        onCancel={closeWidget}
                        onSubmit={(comment) => {
                          onAddAnnotation({
                            filePath: file.displayPath,
                            lineStart: widgetSelection.lineStart,
                            lineEnd: widgetSelection.lineEnd,
                            lineSource: widgetSelection.lineSource,
                            comment,
                          });
                          closeWidget();
                        }}
                      />
                    )}
                  </>
                );
              }}
            />
          </DiffErrorBoundary>
        </div>
      )}
    </section>
  );
}

/**
 * Renders either FileDiffComponent (with expandable collapsed regions) or
 * PatchDiff (fallback). FileDiffComponent is used when we successfully
 * extracted old/new file contents from a full-context diff and re-parsed
 * with parseDiffFromFile (isPartial=false, normal-context hunks).
 */
function DiffRenderer({
  fileDiff,
  rawDiff,
  diffFont,
  diffStyle,
  handleGutterClick,
  handleLineSelected,
  lineAnnotations,
  renderAnnotation,
}: {
  fileDiff: ReturnType<typeof parseDiffFromFile> | null;
  rawDiff: string;
  diffFont?: string;
  diffStyle: DiffStyle;
  handleGutterClick: (range: SelectedLineRange) => void;
  handleLineSelected: (range: SelectedLineRange | null) => void;
  lineAnnotations: DiffLineAnnotation<Annotation>[];
  renderAnnotation: (annotation: DiffLineAnnotation<Annotation>) => React.ReactNode;
}) {
  const style = diffFont ? { "--diffs-font-family": diffFont } as React.CSSProperties : undefined;
  const options = {
    diffStyle,
    themeType: "dark" as const,
    overflow: "wrap" as const,
    hunkSeparators: "line-info" as const,
    enableGutterUtility: true,
    onGutterUtilityClick: handleGutterClick,
    enableLineSelection: true,
    onLineSelected: handleLineSelected,
    expandUnchanged: false,
    collapsedContextThreshold: 5,
  };

  if (fileDiff) {
    return (
      <FileDiffComponent
        fileDiff={fileDiff}
        style={style}
        options={options}
        lineAnnotations={lineAnnotations}
        renderAnnotation={renderAnnotation}
      />
    );
  }

  return (
    <PatchDiff
      patch={rawDiff}
      style={style}
      options={options}
      lineAnnotations={lineAnnotations}
      renderAnnotation={renderAnnotation}
    />
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

function toSide(lineSource: AnnotationLineSource): AnnotationSide {
  return lineSource === "old" ? "deletions" : "additions";
}
