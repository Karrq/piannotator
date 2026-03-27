import { useEffect, useRef, useState } from "react";

interface CommentFormProps {
  label: string;
  initialComment?: string;
  submitLabel?: string;
  onSubmit: (comment: string) => void;
  onCancel: () => void;
}

export function CommentForm({ label, initialComment = "", submitLabel = "Add comment", onSubmit, onCancel }: CommentFormProps) {
  const [comment, setComment] = useState(initialComment);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    const length = textareaRef.current?.value.length ?? 0;
    textareaRef.current?.setSelectionRange(length, length);
  }, [initialComment]);

  return (
    <div className="comment-form">
      <div className="comment-form__label">{label}</div>
      <textarea
        ref={textareaRef}
        className="comment-form__textarea"
        rows={4}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Add a review note"
      />
      <div className="comment-form__actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="comment-form__submit"
          onClick={() => onSubmit(comment.trim())}
          disabled={comment.trim().length === 0}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
