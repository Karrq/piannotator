import { DiffModeEnum } from "@git-diff-view/react";
import { ProgressCircle } from "./ProgressCircle.js";

interface ReviewBannerProps {
  title: string;
  subtitle: string;
  annotationCount: number;
  canSubmit: boolean;
  isDiffMode: boolean;
  diffMode: DiffModeEnum;
  onDiffModeChange: (mode: DiffModeEnum) => void;
  totalFiles: number;
  viewedCount: number;
  onSubmit: () => void;
  onCancel: () => void;
  onClear: () => void;
}

export function ReviewBanner({
  title,
  subtitle,
  annotationCount,
  canSubmit,
  isDiffMode,
  diffMode,
  onDiffModeChange,
  totalFiles,
  viewedCount,
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
        {isDiffMode && totalFiles > 0 && <ProgressCircle total={totalFiles} viewed={viewedCount} />}
        {isDiffMode && (
          <div className="diff-mode-toggle">
            <button
              type="button"
              className={`diff-mode-toggle__btn${diffMode === DiffModeEnum.Unified ? " diff-mode-toggle__btn--active" : ""}`}
              onClick={() => onDiffModeChange(DiffModeEnum.Unified)}
            >
              Unified
            </button>
            <button
              type="button"
              className={`diff-mode-toggle__btn${diffMode === DiffModeEnum.Split ? " diff-mode-toggle__btn--active" : ""}`}
              onClick={() => onDiffModeChange(DiffModeEnum.Split)}
            >
              Split
            </button>
          </div>
        )}
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
