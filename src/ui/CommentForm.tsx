import { useEffect, useRef, useState } from "react";

interface CommentFormProps {
  label: string;
  initialComment?: string;
  submitLabel?: string;
  selectedLinesText?: string;
  onSubmit: (comment: string) => void;
  onCancel: () => void;
}

export function CommentForm({ label, initialComment = "", submitLabel = "Add comment", selectedLinesText, onSubmit, onCancel }: CommentFormProps) {
  const [comment, setComment] = useState(initialComment);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    const length = textareaRef.current?.value.length ?? 0;
    textareaRef.current?.setSelectionRange(length, length);
  }, [initialComment]);

  const trimmedComment = comment.trim();

  return (
    <div className="comment-form">
      <div className="comment-form__label">{label}</div>
      <textarea
        ref={textareaRef}
        className="comment-form__textarea"
        rows={4}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
            return;
          }

          if (event.key === "Enter" && event.metaKey && trimmedComment.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            onSubmit(trimmedComment);
          }
        }}
        placeholder="Add a review note"
      />
      <div className="comment-form__actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        {selectedLinesText && (
          <button
            type="button"
            className="comment-form__suggest"
            onClick={() => {
              const template = "```suggestion\n" + selectedLinesText + "\n```";
              setComment((prev) => prev ? prev + "\n" + template : template);
            }}
          >
            Suggest
          </button>
        )}
        <button
          type="button"
          className="comment-form__submit"
          onClick={() => onSubmit(trimmedComment)}
          disabled={trimmedComment.length === 0}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
