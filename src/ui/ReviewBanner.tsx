import { DiffModeEnum } from "@git-diff-view/react";
import { GearIcon } from "@primer/octicons-react";
import { ProgressCircle } from "./ProgressCircle.js";

interface ReviewBannerProps {
  title: string;
  subtitle: string;
  annotationCount: number;
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
        {totalFiles > 0 && <ProgressCircle total={totalFiles} viewed={viewedCount} />}
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
        {isCommandMode && (
          <button type="button" className="review-banner__settings" onClick={onOpenSettings} aria-label="Settings">
            <GearIcon size={16} />
          </button>
        )}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" onClick={onClear} disabled={annotationCount === 0}>
          Clear
        </button>
        <button type="button" className="review-banner__submit" onClick={onSubmit}>
          <span>Submit review</span>
          <span className="review-banner__badge">{annotationCount}</span>
        </button>
      </div>
    </header>
  );
}
