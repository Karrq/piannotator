interface ReviewBannerProps {
  title: string;
  subtitle: string;
  annotationCount: number;
  canSubmit: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function ReviewBanner({ title, subtitle, annotationCount, canSubmit, onSubmit, onCancel }: ReviewBannerProps) {
  return (
    <header className="review-banner">
      <div className="review-banner__meta">
        <div className="review-banner__title">{title}</div>
        <div className="review-banner__subtitle">
          {subtitle} · {annotationCount} annotation{annotationCount === 1 ? "" : "s"}
        </div>
      </div>
      <div className="review-banner__actions">
        <span className="review-banner__hint">⌘↩ submit · Esc cancel</span>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="review-banner__submit" onClick={onSubmit} disabled={!canSubmit}>
          Submit review
        </button>
      </div>
    </header>
  );
}
