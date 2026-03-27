import { useEffect, useMemo, useState } from "react";
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
  onSubmit: (annotations: AnnotationDraft[]) => void;
  onCancel: () => void;
}

export function App({ init, onSubmit, onCancel }: AppProps) {
  const initialState = useMemo(() => materializeAnnotations(init.annotations), [init.annotations]);
  const [annotations, setAnnotations] = useState<Annotation[]>(initialState.annotations);
  const [nextAnnotationNumber, setNextAnnotationNumber] = useState(initialState.nextAnnotationNumber);
  const [shiftKeyHeld, setShiftKeyHeld] = useState(false);

  const subtitle = useMemo(() => {
    if (init.mode === "diff") {
      return `${init.files.length} file${init.files.length === 1 ? "" : "s"} loaded`;
    }

    const lineCount = init.content.split(/\r?\n/).length;
    return `${lineCount} line${lineCount === 1 ? "" : "s"} loaded`;
  }, [init.content, init.files.length, init.mode]);

  const canSubmit = annotations.length > 0;

  useEffect(() => {
    setAnnotations(initialState.annotations);
    setNextAnnotationNumber(initialState.nextAnnotationNumber);
  }, [initialState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key === "Shift") {
        setShiftKeyHeld(true);
      }

      if (event.key === "Enter" && event.metaKey && canSubmit) {
        event.preventDefault();
        onSubmit(annotationsToDrafts(annotations));
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
  }, [annotations, canSubmit, onCancel, onSubmit]);

  const addAnnotation = (draft: AnnotationDraft) => {
    setNextAnnotationNumber((current) => {
      setAnnotations((existing) => [...existing, materializeAnnotation(draft, current)]);
      return current + 1;
    });
  };

  const clearAnnotations = () => {
    setAnnotations([]);
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

  return (
    <div className="piannotator-shell">
      <ReviewBanner
        title={init.title}
        subtitle={subtitle}
        annotationCount={annotations.length}
        canSubmit={canSubmit}
        onSubmit={() => onSubmit(annotationsToDrafts(annotations))}
        onCancel={onCancel}
      />
      <main className="review-body">
        <section className="review-summary">
          <div className="review-summary__item">
            <span className="review-summary__label">Mode</span>
            <span className="review-summary__value">{init.mode}</span>
          </div>
          <div className="review-summary__item">
            <span className="review-summary__label">Annotations</span>
            <span className="review-summary__value">{annotations.length}</span>
          </div>
          <div className="review-summary__item">
            <span className="review-summary__label">Controls</span>
            <div className="review-actions">
              <button type="button" onClick={clearAnnotations} disabled={annotations.length === 0}>
                Clear annotations
              </button>
            </div>
          </div>
        </section>

        {init.mode === "diff" ? (
          <ReviewView
            files={init.files}
            annotations={annotations}
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
