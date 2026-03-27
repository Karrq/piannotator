import { formatTextReference, isTextAnnotation, type Annotation } from "../types.js";

interface TextReviewProps {
  content: string;
  annotations: Annotation[];
}

export function TextReview({ content, annotations }: TextReviewProps) {
  const lines = content.split(/\r?\n/);
  const textAnnotations = annotations.filter(isTextAnnotation);
  const annotatedLines = new Set<number>();

  for (const annotation of textAnnotations) {
    const end = annotation.lineEnd ?? annotation.lineStart;
    for (let line = annotation.lineStart; line <= end; line += 1) {
      annotatedLines.add(line);
    }
  }

  return (
    <div className="review-panel">
      <div className="review-panel__header">
        <div>
          <div className="review-panel__title">Text review preview</div>
          <div className="review-panel__meta">Placeholder shell until inline comment widgets land.</div>
        </div>
      </div>
      <div className="review-panel__body">
        <p className="review-placeholder">
          Use the placeholder controls below to exercise the Glimpse bridge before the real text review surface is wired in.
        </p>
        <pre className="review-code">
          {lines.map((line, index) => {
            const lineNumber = index + 1;
            const className = annotatedLines.has(lineNumber) ? "review-code__line review-code__line--annotated" : "review-code__line";
            return (
              <span key={lineNumber} className={className}>
                <span className="review-code__line-number">{lineNumber}</span>
                {line}
              </span>
            );
          })}
        </pre>
        {textAnnotations.length > 0 ? (
          <div className="annotation-list">
            {textAnnotations.map((annotation) => (
              <article key={annotation.id} className="annotation-card">
                <div className="annotation-card__header">
                  <span className="annotation-card__id">{annotation.id}</span>
                  <span className="annotation-card__ref">{formatTextReference(annotation.lineStart, annotation.lineEnd)}</span>
                </div>
                <p className="annotation-card__comment">{annotation.comment}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No annotations yet.</p>
        )}
      </div>
    </div>
  );
}
