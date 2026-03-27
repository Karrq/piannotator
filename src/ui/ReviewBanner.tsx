interface ReviewBannerProps {
  title: string;
  subtitle: string;
  annotationCount: number;
  canSubmit: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  onClear: () => void;
}

export function ReviewBanner({
  title,
  subtitle,
  annotationCount,
  canSubmit,
  onSubmit,
  onCancel,
  onClear
}: ReviewBannerProps) {
  return (
    <header className="review-banner">
      <div className="review-banner__meta">
        <div className="review-banner__title">{title}</div>
        <div className="review-banner__subtitle">
          {subtitle} · {annotationCount} annotation{annotationCount === 1 ? "" : "s"}
        </div>
      </div>
      <div className="review-banner__actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" onClick={onClear} disabled={annotationCount === 0}>
          Clear
        </button>
        <button type="button" className="review-banner__submit" onClick={onSubmit} disabled={!canSubmit}>
          <span>Submit review</span>
          <span className="review-banner__badge">{annotationCount}</span>
        </button>
      </div>
    </header>
  );
}
