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
  isCommandMode: boolean;
  onOpenSettings: () => void;
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
  isCommandMode,
  onOpenSettings,
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
        {isCommandMode && (
          <button type="button" className="review-banner__settings" onClick={onOpenSettings} aria-label="Settings">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492ZM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0Z" />
              <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.902 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319Zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291a1.873 1.873 0 0 0-1.116-2.693l-.318-.094c-.835-.246-.835-1.428 0-1.674l.319-.094a1.873 1.873 0 0 0 1.115-2.692l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.116l.094-.318Z" />
            </svg>
          </button>
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
