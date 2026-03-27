import { useState } from "react";
import { formatAnnotationReference, type DiffAnnotation } from "../types.js";
import { CommentForm } from "./CommentForm.js";
import type { DiffThreadData } from "./diff-panel-helpers.js";

interface CommentThreadProps {
  data: DiffThreadData;
  onUpdateComment: (annotationId: string, comment: string) => void;
  onDeleteComment: (annotationId: string) => void;
}

export function CommentThread({ data, onUpdateComment, onDeleteComment }: CommentThreadProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="comment-thread">
      {data.comments.map((comment) => {
        const isEditing = editingId === comment.id;
        return (
          <article key={comment.id} className="annotation-card annotation-card--inline">
            <div className="annotation-card__header">
              <span className="annotation-card__id">{comment.id}</span>
              <span className="annotation-card__ref">{formatAnnotationReference(comment)}</span>
            </div>
            {isEditing ? (
              <CommentForm
                label={formatReferenceLabel(comment)}
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

function formatReferenceLabel(annotation: DiffAnnotation): string {
  return annotation.lineEnd === undefined
    ? `Line ${annotation.lineStart}`
    : `Lines ${annotation.lineStart}-${annotation.lineEnd}`;
}
