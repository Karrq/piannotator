import { useEffect, useMemo, useState } from "react";
import { ReviewBanner } from "./ReviewBanner.js";
import { ReviewView } from "./ReviewView.js";
import { TextReview } from "./TextReview.js";
import { findFirstChangedLine } from "../diff-parser.js";
import {
  formatAnnotationReference,
  truncateAnnotationSummary,
  type Annotation,
  type AnnotationDraft,
  type DiffAnnotation,
  type ReviewBridgeInit,
  type TextAnnotation
} from "../types.js";

interface AppProps {
  init: ReviewBridgeInit;
  onSubmit: (annotations: AnnotationDraft[]) => void;
  onCancel: () => void;
}

export function App({ init, onSubmit, onCancel }: AppProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>(() => materializeAnnotations(init.annotations));

  const subtitle = useMemo(() => {
    if (init.mode === "diff") {
      return `${init.files.length} file${init.files.length === 1 ? "" : "s"} loaded`;
    }

    const lineCount = init.content.split(/\r?\n/).length;
    return `${lineCount} line${lineCount === 1 ? "" : "s"} loaded`;
  }, [init.content, init.files.length, init.mode]);

  const canSubmit = annotations.length > 0;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key === "Enter" && event.metaKey && canSubmit) {
        event.preventDefault();
        onSubmit(annotationsToDrafts(annotations));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [annotations, canSubmit, onCancel, onSubmit]);

  const addPlaceholderAnnotation = () => {
    const nextId = `A${annotations.length + 1}`;
    const next = init.mode === "diff" ? createPlaceholderDiffAnnotation(nextId, annotations.length, init) : createPlaceholderTextAnnotation(nextId, annotations.length, init);
    if (!next) {
      return;
    }

    setAnnotations((current) => [...current, next]);
  };

  const clearAnnotations = () => {
    setAnnotations([]);
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
            <span className="review-summary__label">Placeholder controls</span>
            <div className="review-actions">
              <button type="button" onClick={addPlaceholderAnnotation}>
                Add placeholder annotation
              </button>
              <button type="button" onClick={clearAnnotations} disabled={annotations.length === 0}>
                Clear annotations
              </button>
            </div>
          </div>
        </section>

        {init.mode === "diff" ? (
          <ReviewView files={init.files} annotations={annotations} />
        ) : (
          <TextReview content={init.content} annotations={annotations} />
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
              <p className="empty-state">Add a placeholder annotation to exercise submit and cancel while the real review UI is under construction.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function materializeAnnotations(drafts: AnnotationDraft[]): Annotation[] {
  return drafts.map((draft, index) => {
    if (draft.kind === "diff") {
      const annotation: DiffAnnotation = {
        ...draft,
        id: `A${index + 1}`,
        summary: truncateAnnotationSummary(draft.comment)
      };
      return annotation;
    }

    const annotation: TextAnnotation = {
      ...draft,
      id: `A${index + 1}`,
      summary: truncateAnnotationSummary(draft.comment)
    };
    return annotation;
  });
}

function annotationsToDrafts(annotations: Annotation[]): AnnotationDraft[] {
  return annotations.map(({ id: _id, summary: _summary, ...draft }) => draft);
}

function createPlaceholderTextAnnotation(id: string, index: number, init: ReviewBridgeInit): TextAnnotation | null {
  const lines = init.content.split(/\r?\n/);
  const firstContentLine = lines.findIndex((line) => line.trim().length > 0);
  const lineStart = firstContentLine === -1 ? 1 : firstContentLine + 1 + index;
  const clampedLine = Math.min(Math.max(lineStart, 1), Math.max(lines.length, 1));
  const comment = `Placeholder text note ${index + 1} on line ${clampedLine}.`;

  return {
    kind: "text",
    id,
    lineSource: "text",
    lineStart: clampedLine,
    comment,
    summary: truncateAnnotationSummary(comment)
  };
}

function createPlaceholderDiffAnnotation(id: string, index: number, init: ReviewBridgeInit): DiffAnnotation | null {
  const file = init.files[index % Math.max(init.files.length, 1)];
  if (!file) {
    return null;
  }

  const firstChangedLine = findFirstChangedLine(file);
  if (!firstChangedLine) {
    return {
      kind: "diff",
      id,
      filePath: file.displayPath,
      lineSource: "new",
      lineStart: 1,
      comment: `Placeholder diff note ${index + 1} for ${file.displayPath}.`,
      summary: truncateAnnotationSummary(`Placeholder diff note ${index + 1} for ${file.displayPath}.`)
    };
  }

  const comment = `Placeholder diff note ${index + 1} for ${file.displayPath}:${firstChangedLine.lineNumber}.`;
  return {
    kind: "diff",
    id,
    filePath: file.displayPath,
    lineSource: firstChangedLine.lineSource,
    lineStart: firstChangedLine.lineNumber,
    comment,
    summary: truncateAnnotationSummary(comment)
  };
}
