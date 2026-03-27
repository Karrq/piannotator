import type { Annotation, DiffAnnotation, DiffAnnotationDraft, ReviewFile } from "../types.js";
import { DiffPanel } from "./DiffPanel.js";

interface ReviewViewProps {
  files: ReviewFile[];
  annotations: Annotation[];
  addDiffAnnotation: (draft: DiffAnnotationDraft) => void;
  updateComment: (annotationId: string, comment: string) => void;
  deleteAnnotation: (annotationId: string) => void;
}

export function ReviewView({ files, annotations, addDiffAnnotation, updateComment, deleteAnnotation }: ReviewViewProps) {
  const diffAnnotations = annotations.filter((annotation): annotation is DiffAnnotation => annotation.kind === "diff");
  const primaryFile = files[0];
  const hiddenFileCount = Math.max(0, files.length - 1);
  const primaryFileAnnotations = primaryFile ? diffAnnotations.filter((annotation) => annotation.filePath === primaryFile.displayPath) : [];

  if (!primaryFile) {
    return (
      <section className="review-panel">
        <div className="review-panel__header">
          <div>
            <div className="review-panel__title">Diff review preview</div>
            <div className="review-panel__meta">No parsed diff files were available for rendering.</div>
          </div>
        </div>
        <div className="review-panel__body">
          <p className="empty-state">The request was detected as diff mode, but no per-file hunks were parsed.</p>
        </div>
      </section>
    );
  }

  return (
    <div className="review-file-list">
      <DiffPanel
        file={primaryFile}
        annotations={primaryFileAnnotations}
        onAddAnnotation={addDiffAnnotation}
        onUpdateAnnotation={updateComment}
        onDeleteAnnotation={deleteAnnotation}
      />
      {hiddenFileCount > 0 ? (
        <section className="review-panel">
          <div className="review-panel__header">
            <div>
              <div className="review-panel__title">More files coming soon</div>
              <div className="review-panel__meta">Phase 10 adds the multi-file review list and tree sidebar.</div>
            </div>
          </div>
          <div className="review-panel__body">
            <p className="empty-state">
              {hiddenFileCount} additional file{hiddenFileCount === 1 ? " is" : "s are"} parsed and waiting for the multi-file view.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
