import { formatAnnotationReference, type Annotation, type DiffAnnotation, type ReviewFile } from "../types.js";

interface ReviewViewProps {
  files: ReviewFile[];
  annotations: Annotation[];
}

export function ReviewView({ files, annotations }: ReviewViewProps) {
  const diffAnnotations = annotations.filter((annotation): annotation is DiffAnnotation => annotation.kind === "diff");
  const annotationCounts = new Map<string, number>();

  for (const annotation of diffAnnotations) {
    annotationCounts.set(annotation.filePath, (annotationCounts.get(annotation.filePath) ?? 0) + 1);
  }

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <div>
          <div className="review-panel__title">Diff review preview</div>
          <div className="review-panel__meta">Minimal Glimpse shell before diff widgets and file tree arrive.</div>
        </div>
      </div>
      <div className="review-panel__body">
        <p className="review-placeholder">
          This placeholder view renders the parsed diff files, stats, and current annotations so the bundle and bridge can be tested safely.
        </p>
        <div className="review-file-list">
          {files.map((file) => (
            <article key={`${file.oldPath}:${file.newPath}`} className="review-file">
              <div className="review-file__header">
                <div className="review-file__path">{file.displayPath}</div>
                <div className="review-file__stats">
                  <span>
                    <strong>+{file.additions}</strong>
                  </span>
                  <span>
                    <strong>-{file.deletions}</strong>
                  </span>
                  <span>
                    <strong>{annotationCounts.get(file.displayPath) ?? 0}</strong> notes
                  </span>
                </div>
              </div>
              <pre className="review-code">{file.rawDiff}</pre>
            </article>
          ))}
        </div>
        {diffAnnotations.length > 0 ? (
          <div className="annotation-list" style={{ marginTop: "1rem" }}>
            {diffAnnotations.map((annotation) => (
              <article key={annotation.id} className="annotation-card">
                <div className="annotation-card__header">
                  <span className="annotation-card__id">{annotation.id}</span>
                  <span className="annotation-card__ref">{formatAnnotationReference(annotation)}</span>
                </div>
                <p className="annotation-card__comment">{annotation.comment}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No annotations yet.</p>
        )}
      </div>
    </section>
  );
}
