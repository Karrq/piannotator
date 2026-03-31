import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@primer/octicons-react";
import type { TimelineItem, TimelineReviewItem } from "../types.js";
import { buildVcsCommand } from "./vcs-command.js";

interface ScopeSelectorProps {
  timeline: TimelineItem[] | null;
  loading: boolean;
  onRequestTimeline: () => void;
  onReviewScope: (command: string, fromIndex: number, toIndex: number) => void;
  scopeLoading: boolean;
  vcsType: "git" | "jj" | null;
  baselineRef: string | undefined;
}

export function ScopeSelector({
  timeline,
  loading,
  onRequestTimeline,
  onReviewScope,
  scopeLoading,
  vcsType,
  baselineRef
}: ScopeSelectorProps) {
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [commandOverride, setCommandOverride] = useState("");
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!timeline) {
      onRequestTimeline();
    }
  }, []);

  const selectionStart = anchorIndex !== null && focusIndex !== null
    ? Math.min(anchorIndex, focusIndex)
    : anchorIndex;
  const selectionEnd = anchorIndex !== null && focusIndex !== null
    ? Math.max(anchorIndex, focusIndex)
    : anchorIndex;

  const handleMouseDown = useCallback((index: number, event: React.MouseEvent) => {
    if (event.shiftKey && anchorIndex !== null) {
      // Shift-click: extend range from anchor, don't reset
      setFocusIndex(index);
      setPreviewIndex(index);
      return;
    }
    // Normal click: set new anchor, start potential drag
    draggingRef.current = true;
    setAnchorIndex(index);
    setFocusIndex(null);
    setPreviewIndex(index);
  }, [anchorIndex]);

  const handleMouseEnter = useCallback((index: number) => {
    if (draggingRef.current && anchorIndex !== null) {
      setFocusIndex(index);
      setPreviewIndex(index);
    }
  }, [anchorIndex]);

  useEffect(() => {
    const handleMouseUp = () => { draggingRef.current = false; };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  // Compute VCS command from current selection
  const computedCommand = timeline && selectionStart !== null && selectionStart !== undefined
    ? buildVcsCommand(vcsType, baselineRef, timeline, selectionStart, selectionEnd ?? selectionStart)
    : null;

  // Update the command textarea when selection changes (only if user hasn't manually edited)
  const userEditedRef = useRef(false);
  useEffect(() => {
    if (!userEditedRef.current && computedCommand) {
      setCommandOverride(computedCommand);
    }
  }, [computedCommand]);

  const handleReview = useCallback(() => {
    if (selectionStart === null || selectionStart === undefined) return;
    const end = selectionEnd ?? selectionStart;
    const command = commandOverride.trim() || computedCommand || "";
    onReviewScope(command, selectionStart, end);
  }, [selectionStart, selectionEnd, onReviewScope, commandOverride, computedCommand]);

  const hasSelection = selectionStart !== null && selectionStart !== undefined;

  if (loading) {
    return (
      <div className="scope-selector">
        <div className="scope-selector__loading">Loading timeline...</div>
      </div>
    );
  }

  if (!timeline || timeline.length === 0) {
    return (
      <div className="scope-selector">
        <div className="scope-selector__empty">No turns found in this session.</div>
      </div>
    );
  }

  // Display in reverse order (most recent at top)
  const reversedItems = [...timeline].reverse();
  const toOriginalIndex = (displayIndex: number) => timeline.length - 1 - displayIndex;

  const previewItem = previewIndex !== null ? timeline[previewIndex] : null;

  return (
    <div className="scope-selector">
      <div className="scope-selector__header">
        <span className="scope-selector__title">Select review scope</span>
        <button
          type="button"
          className="scope-selector__review-btn"
          onClick={handleReview}
          disabled={!hasSelection || scopeLoading}
        >
          {scopeLoading ? "Loading..." : "Review selected"}
        </button>
      </div>
      <div className="scope-selector__body">
        <div className="scope-selector__list">
          {reversedItems.map((item, displayIndex) => {
            const originalIndex = toOriginalIndex(displayIndex);
            const isSelected = selectionStart !== null && selectionStart !== undefined
              && selectionEnd !== null && selectionEnd !== undefined
              && originalIndex >= selectionStart && originalIndex <= selectionEnd;
            const isAnchor = originalIndex === anchorIndex;

            if (item.kind === "review") {
              return (
                <div
                  key={`review-${displayIndex}`}
                  className={`scope-selector__item scope-selector__item--review${isSelected ? " scope-selector__item--selected" : ""}`}
                  onMouseDown={(e) => handleMouseDown(originalIndex, e)}
                  onMouseEnter={() => handleMouseEnter(originalIndex)}
                  onClick={() => setPreviewIndex(originalIndex)}
                >
                  <span className="scope-selector__review-marker">Review</span>
                  <span className="scope-selector__timestamp">{formatTimestamp(item.timestamp)}</span>
                  <span className="scope-selector__review-id">{item.reviewId}</span>
                  {item.annotationCount !== undefined && (
                    <span className="scope-selector__annotation-count">
                      {item.annotationCount} annotation{item.annotationCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              );
            }

            return (
              <div
                key={`turn-${displayIndex}`}
                className={`scope-selector__item scope-selector__item--turn${isSelected ? " scope-selector__item--selected" : ""}${isAnchor ? " scope-selector__item--anchor" : ""}`}
                onMouseDown={(e) => handleMouseDown(originalIndex, e)}
                onMouseEnter={() => handleMouseEnter(originalIndex)}
                onClick={() => setPreviewIndex(originalIndex)}
              >
                <span className="scope-selector__timestamp">{formatTimestamp(item.timestamp)}</span>
                <span className="scope-selector__preview">{item.preview || "(empty)"}</span>
              </div>
            );
          })}
        </div>
        <div className="scope-selector__detail">
          {previewItem ? (
            previewItem.kind === "turn" ? (
              <>
                <div className="scope-selector__detail-label">User message</div>
                <div className="scope-selector__detail-text">{previewItem.fullText}</div>
              </>
            ) : (
              <ReviewPreview review={previewItem as TimelineReviewItem} />
            )
          ) : (
            <div className="scope-selector__detail-placeholder">
              Click a turn to preview the user message
            </div>
          )}
        </div>
      </div>
      <div className="scope-selector__advanced">
        <button
          type="button"
          className="scope-selector__advanced-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />} Advanced Options
        </button>
        {showAdvanced && (
          <div className="scope-selector__advanced-body">
            <textarea
              className="scope-selector__command-input"
              value={commandOverride}
              onChange={(e) => {
                setCommandOverride(e.target.value);
                userEditedRef.current = true;
              }}
              rows={2}
              placeholder="VCS diff command..."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewPreview({ review }: { review: TimelineReviewItem }) {
  return (
    <>
      <div className="scope-selector__detail-label">
        {review.title ? `Review: ${review.title}` : `Review ${review.reviewId}`}
      </div>
      <div className="scope-selector__detail-text">
        <div className="scope-selector__review-overview">
          <div className="scope-selector__review-stat">
            {review.annotationCount ?? 0} annotation{(review.annotationCount ?? 0) === 1 ? "" : "s"}
          </div>
          {review.overallComment && (
            <div className="scope-selector__review-comment">{review.overallComment}</div>
          )}
          {review.annotationSummaries && review.annotationSummaries.length > 0 && (
            <ul className="scope-selector__review-annotations">
              {review.annotationSummaries.map((summary, i) => (
                <li key={i}>{summary}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return timestamp;
  }
}
