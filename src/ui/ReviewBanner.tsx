import { DiffModeEnum } from "@git-diff-view/react";
import { ChevronLeftIcon, ChevronRightIcon, GearIcon } from "@primer/octicons-react";
import { ProgressCircle } from "./ProgressCircle.js";

interface TabInfo {
  id: string;
  command: string;
  annotationCount: number;
}

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
  tabs?: TabInfo[];
  activeTabIndex?: number;
  onTabChange?: (index: number) => void;
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
  onClear,
  tabs,
  activeTabIndex,
  onTabChange
}: ReviewBannerProps) {
  const showTabs = tabs && tabs.length > 1 && onTabChange && activeTabIndex !== undefined;
  const displayTitle = showTabs ? (tabs[activeTabIndex].command || `Tab ${activeTabIndex + 1}`) : title;

  return (
    <header className="review-banner">
      <div className="review-banner__meta">
        {showTabs ? (
          <div className="review-banner__tabs">
            <button
              type="button"
              className="review-banner__tab-nav"
              onClick={() => onTabChange(activeTabIndex - 1)}
              disabled={activeTabIndex === 0}
              aria-label="Previous version"
            >
              <ChevronLeftIcon size={16} />
            </button>
            <div className="review-banner__tab-label">
              <div className="review-banner__title" title={displayTitle}>{displayTitle}</div>
              <div className="review-banner__subtitle">
                {activeTabIndex + 1}/{tabs.length} · {subtitle} · {annotationCount} annotation{annotationCount === 1 ? "" : "s"}
              </div>
            </div>
            <button
              type="button"
              className="review-banner__tab-nav"
              onClick={() => onTabChange(activeTabIndex + 1)}
              disabled={activeTabIndex === tabs.length - 1}
              aria-label="Next version"
            >
              <ChevronRightIcon size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="review-banner__title">{displayTitle}</div>
            <div className="review-banner__subtitle">
              {subtitle} · {annotationCount} annotation{annotationCount === 1 ? "" : "s"}
            </div>
          </>
        )}
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
