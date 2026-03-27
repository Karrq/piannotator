import { useState } from "react";
import { formatAnnotationReference, type Annotation } from "../types.js";
import { CommentForm } from "./CommentForm.js";

interface CommentThreadProps<T extends Annotation = Annotation> {
  comments: T[];
  onUpdateComment: (annotationId: string, comment: string) => void;
  onDeleteComment: (annotationId: string) => void;
}

export function CommentThread<T extends Annotation>({ comments, onUpdateComment, onDeleteComment }: CommentThreadProps<T>) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="comment-thread">
      {comments.map((comment) => {
        const isEditing = editingId === comment.id;
        return (
          <article key={comment.id} className="annotation-card annotation-card--inline">
            <div className="annotation-card__header">
              <span className="annotation-card__id">{comment.id}</span>
              <span className="annotation-card__ref">{formatAnnotationReference(comment)}</span>
            </div>
            {isEditing ? (
              <CommentForm
                label={formatReferenceLabel(comment.lineStart, comment.lineEnd)}
                initialComment={comment.comment}
                submitLabel="Save"
                onCancel={() => setEditingId(null)}
                onSubmit={(nextComment) => {
                  onUpdateComment(comment.id, nextComment);
                  setEditingId(null);
                }}
              />
            ) : (
              <>
                <p className="annotation-card__comment">{comment.comment}</p>
                <div className="annotation-card__actions">
                  <button type="button" onClick={() => setEditingId(comment.id)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => onDeleteComment(comment.id)}>
                    Delete
                  </button>
                </div>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

function formatReferenceLabel(lineStart: number, lineEnd?: number): string {
  return lineEnd === undefined ? `Line ${lineStart}` : `Lines ${lineStart}-${lineEnd}`;
}
