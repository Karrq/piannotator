import { useEffect, useMemo, useState } from "react";
import { DiffModeEnum } from "@git-diff-view/react";
import { ReviewBanner } from "./ReviewBanner.js";
import { ReviewView } from "./ReviewView.js";
import { TextReview } from "./TextReview.js";
import { annotationsToDrafts, materializeAnnotation, materializeAnnotations, removeAnnotation, updateAnnotationComment } from "./annotation-state.js";
import {
  formatAnnotationReference,
  truncateAnnotationSummary,
  type Annotation,
  type AnnotationDraft,
  type DiffAnnotationDraft,
  type ReviewBridgeInit,
  type TextAnnotationDraft
} from "../types.js";

interface AppProps {
  init: ReviewBridgeInit;
  onSubmit: (annotations: AnnotationDraft[], overallComment?: string) => void;
  onCancel: () => void;
}

type PendingFinalAction = "submit" | "cancel" | null;

export function App({ init, onSubmit, onCancel }: AppProps) {
  const initialState = useMemo(() => materializeAnnotations(init.annotations), [init.annotations]);
  const [annotations, setAnnotations] = useState<Annotation[]>(initialState.annotations);
  const [nextAnnotationNumber, setNextAnnotationNumber] = useState(initialState.nextAnnotationNumber);
  const [shiftKeyHeld, setShiftKeyHeld] = useState(false);
  const [pendingFinalAction, setPendingFinalAction] = useState<PendingFinalAction>(null);
  const [diffMode, setDiffMode] = useState(DiffModeEnum.Unified);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set());
  const [overallComment, setOverallComment] = useState("");

  const subtitle = useMemo(() => {
    if (init.mode === "diff") {
      return `${init.files.length} file${init.files.length === 1 ? "" : "s"} loaded`;
    }

    const lineCount = init.content.split(/\r?\n/).length;
    return `${lineCount} line${lineCount === 1 ? "" : "s"} loaded`;
  }, [init.content, init.files.length, init.mode]);

  const canSubmit = annotations.length > 0 || overallComment.trim().length > 0;

  const dismissConfirmation = () => {
    setPendingFinalAction(null);
  };

  const submitReview = () => {
    dismissConfirmation();
    const comment = overallComment.trim() || undefined;
    onSubmit(annotationsToDrafts(annotations), comment);
  };

  const cancelReview = () => {
    dismissConfirmation();
    onCancel();
  };

  const openSubmitConfirmation = () => {
    if (!canSubmit) {
      return;
    }

    setPendingFinalAction("submit");
  };

  const openCancelConfirmation = () => {
    setPendingFinalAction("cancel");
  };

  useEffect(() => {
    setAnnotations(initialState.annotations);
    setNextAnnotationNumber(initialState.nextAnnotationNumber);
  }, [initialState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && event.metaKey) {
        event.preventDefault();

        if (pendingFinalAction === "submit") {
          submitReview();
        } else if (pendingFinalAction === "cancel") {
          cancelReview();
        } else {
          openSubmitConfirmation();
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();

        if (pendingFinalAction !== null) {
          dismissConfirmation();
        } else {
          openCancelConfirmation();
        }
        return;
      }

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
  }, [cancelReview, dismissConfirmation, openCancelConfirmation, openSubmitConfirmation, pendingFinalAction, submitReview]);

  const addAnnotation = (draft: AnnotationDraft) => {
    dismissConfirmation();
    setNextAnnotationNumber((current) => {
      setAnnotations((existing) => [...existing, materializeAnnotation(draft, current)]);
      return current + 1;
    });
  };

  const clearAnnotations = () => {
    dismissConfirmation();
    setAnnotations([]);
  };

  const toggleViewed = (filePath: string) => {
    setViewedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
        // Auto-collapse when marking as viewed
        setCollapsedFiles((collapsed) => new Set([...collapsed, filePath]));
      }
      return next;
    });
  };

  const toggleCollapsed = (filePath: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const annotationActions = {
    addDiffAnnotation: (draft: DiffAnnotationDraft) => addAnnotation(draft),
    addTextAnnotation: (draft: TextAnnotationDraft) => addAnnotation(draft),
    updateComment: (annotationId: string, comment: string) => {
      setAnnotations((current) => updateAnnotationComment(current, annotationId, comment));
    },
    deleteAnnotation: (annotationId: string) => {
      setAnnotations((current) => removeAnnotation(current, annotationId));
    }
  };

  const modalTitle = pendingFinalAction === "submit" ? "Submit review?" : "Discard review?";
  const modalConfirmLabel = pendingFinalAction === "submit" ? "Submit review" : "Discard review";
  const modalConfirmAction = pendingFinalAction === "submit" ? submitReview : cancelReview;
  const modalConfirmClassName =
    pendingFinalAction === "submit"
      ? "review-modal__confirm"
      : "review-modal__confirm review-modal__confirm--danger";

  return (
    <div className="piannotator-shell">
      <ReviewBanner
        title={init.title}
        subtitle={subtitle}
        annotationCount={annotations.length}
        canSubmit={canSubmit}
        isDiffMode={init.mode === "diff"}
        diffMode={diffMode}
        onDiffModeChange={setDiffMode}
        totalFiles={init.mode === "diff" ? init.files.length : 0}
        viewedCount={viewedFiles.size}
        onSubmit={openSubmitConfirmation}
        onCancel={openCancelConfirmation}
        onClear={clearAnnotations}
      />
      {pendingFinalAction !== null ? (
        <div className="review-modal" role="presentation" onClick={dismissConfirmation}>
          <div
            className="review-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div id="review-modal-title" className="review-modal__title">
              {modalTitle}
            </div>
            {pendingFinalAction === "submit" && (
              <textarea
                className="review-modal__comment"
                placeholder="Optional overall review comment..."
                value={overallComment}
                onChange={(e) => setOverallComment(e.target.value)}
                rows={3}
              />
            )}
            <div className="review-modal__actions">
              <button type="button" onClick={dismissConfirmation}>
                Cancel
              </button>
              <button type="button" className={modalConfirmClassName} onClick={modalConfirmAction}>
                {modalConfirmLabel} <span className="review-modal__shortcut">⌘↩</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <main className="review-body">
        {init.mode === "diff" ? (
          <ReviewView
            files={init.files}
            annotations={annotations}
            diffMode={diffMode}
            collapsedFiles={collapsedFiles}
            onToggleCollapsed={toggleCollapsed}
            viewedFiles={viewedFiles}
            onToggleViewed={toggleViewed}
            shiftKeyHeld={shiftKeyHeld}
            addDiffAnnotation={annotationActions.addDiffAnnotation}
            updateComment={annotationActions.updateComment}
            deleteAnnotation={annotationActions.deleteAnnotation}
          />
        ) : (
          <TextReview
            content={init.content}
            annotations={annotations}
            shiftKeyHeld={shiftKeyHeld}
            onAddAnnotation={annotationActions.addTextAnnotation}
            onUpdateAnnotation={annotationActions.updateComment}
            onDeleteAnnotation={annotationActions.deleteAnnotation}
          />
        )}

        <section className="review-panel">
          <div className="review-panel__header">
            <div>
              <div className="review-panel__title">Current annotation payload</div>
              <div className="review-panel__meta">This mirrors the payload that submit sends back through Glimpse.</div>
            </div>
          </div>
          <div className="review-panel__body">
            {annotations.length > 0 ? (
              <div className="annotation-list">
                {annotations.map((annotation) => (
                  <article key={annotation.id} className="annotation-card">
                    <div className="annotation-card__header">
                      <span className="annotation-card__id">{annotation.id}</span>
                      <span className="annotation-card__ref">{formatAnnotationReference(annotation)}</span>
                    </div>
                    <p className="annotation-card__comment">{truncateAnnotationSummary(annotation.comment, 120)}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state">
                {init.mode === "diff"
                  ? "Use the inline plus button to add single-line diff comments."
                  : "Use the line buttons to add single-line or range comments in text mode."}
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
