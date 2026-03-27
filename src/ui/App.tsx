import { useEffect, useMemo, useRef, useState } from "react";
import { DiffModeEnum } from "@git-diff-view/react";
import { ReviewBanner } from "./ReviewBanner.js";
import { ReviewView } from "./ReviewView.js";
import { annotationsToDrafts, materializeAnnotation, removeAnnotation, updateAnnotationComment } from "./annotation-state.js";
import {
  formatAnnotationReference,
  truncateAnnotationSummary,
  type Annotation,
  type AnnotationDraft,
  type ReviewBridgeExtensionMessage,
  type ReviewBridgeInit,
  type ReviewBridgeVersion,
  type ReviewFile
} from "../types.js";

interface AppProps {
  init: ReviewBridgeInit;
  onSubmit: (versions: ReviewBridgeVersion[], overallComment?: string) => void;
  onCancel: () => void;
  onRerunCommand?: (command: string) => void;
  onExtensionMessage?: (listener: (msg: ReviewBridgeExtensionMessage) => void) => () => void;
}

interface ReviewTab {
  id: string;
  command: string;
  content: string;
  files: ReviewFile[];
  annotations: Annotation[];
  nextAnnotationNumber: number;
  viewedFiles: Set<string>;
  collapsedFiles: Set<string>;
}

type PendingFinalAction = "submit" | "cancel" | null;

export function App({ init, onSubmit, onCancel, onRerunCommand, onExtensionMessage }: AppProps) {
  const [tabs, setTabs] = useState<ReviewTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [shiftKeyHeld, setShiftKeyHeld] = useState(false);
  const [pendingFinalAction, setPendingFinalAction] = useState<PendingFinalAction>(null);
  const [diffMode, setDiffMode] = useState(DiffModeEnum.Unified);
  const [overallComment, setOverallComment] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [editingCommand, setEditingCommand] = useState(init.command ?? "");
  const editingCommandRef = useRef(editingCommand);
  editingCommandRef.current = editingCommand;
  const [commandError, setCommandError] = useState<string | null>(null);
  const [commandRunning, setCommandRunning] = useState(false);
  const [pendingRerun, setPendingRerun] = useState(false);


  // Create initial tab on mount
  useEffect(() => {
    addTab(init.command ?? "", init.content, init.files);
  }, []);

  const activeTab = tabs[activeTabIndex];

  const totalAnnotations = useMemo(() => tabs.reduce((sum, tab) => sum + tab.annotations.length, 0), [tabs]);

  const subtitle = useMemo(() => {
    if (!activeTab) return "";
    return `${activeTab.files.length} file${activeTab.files.length === 1 ? "" : "s"} loaded`;
  }, [activeTab?.files.length]);

  const canSubmit = totalAnnotations > 0 || overallComment.trim().length > 0;

  function addTab(command: string, content: string, files: ReviewFile[]) {
    const newTab: ReviewTab = {
      id: `tab-${Date.now()}`,
      command,
      content,
      files,
      annotations: [],
      nextAnnotationNumber: 1,
      viewedFiles: new Set(),
      collapsedFiles: new Set()
    };
    setTabs((prev) => {
      const next = [...prev, newTab];
      setActiveTabIndex(next.length - 1);
      return next;
    });
  }

  function updateActiveTab(updater: (tab: ReviewTab) => ReviewTab) {
    setTabs((prev) => prev.map((tab, i) => (i === activeTabIndex ? updater(tab) : tab)));
  }

  function deleteTab(index: number) {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== index);
      // Adjust active tab index if needed
      if (activeTabIndex >= next.length) {
        setActiveTabIndex(next.length - 1);
      } else if (activeTabIndex > index) {
        setActiveTabIndex(activeTabIndex - 1);
      }
      return next;
    });
  }

  const dismissConfirmation = () => setPendingFinalAction(null);

  const submitReview = () => {
    dismissConfirmation();
    const comment = overallComment.trim() || undefined;
    const versions: ReviewBridgeVersion[] = tabs.map((tab) => ({
      command: tab.command || undefined,
      annotations: annotationsToDrafts(tab.annotations)
    }));
    onSubmit(versions, comment);
  };

  const cancelReview = () => {
    dismissConfirmation();
    onCancel();
  };

  const openSubmitConfirmation = () => setPendingFinalAction("submit");
  const openCancelConfirmation = () => setPendingFinalAction("cancel");

  // Listen for extension-to-UI messages (update/rerun-error)
  useEffect(() => {
    if (!onExtensionMessage) return;
    return onExtensionMessage((msg) => {
      if (msg.type === "update") {
        addTab(editingCommandRef.current, msg.content, msg.files);
        setCommandRunning(false);
        setCommandError(null);
      } else if (msg.type === "rerun-error") {
        setCommandRunning(false);
        setCommandError(msg.error);
      }
    });
  }, [onExtensionMessage]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && event.metaKey) {
        event.preventDefault();

        if (pendingFinalAction === "submit" && canSubmit) {
          submitReview();
        } else if (pendingFinalAction === "cancel") {
          cancelReview();
        } else {
          openSubmitConfirmation();
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();

        if (showSettings) {
          setShowSettings(false);
          setCommandError(null);
          setPendingRerun(false);
        } else if (pendingFinalAction !== null) {
          dismissConfirmation();
        } else {
          openCancelConfirmation();
        }
        return;
      }

      if (event.key === "Shift") {
        setShiftKeyHeld(true);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setShiftKeyHeld(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [cancelReview, dismissConfirmation, openCancelConfirmation, openSubmitConfirmation, pendingFinalAction, submitReview]);

  const addAnnotation = (draft: AnnotationDraft) => {
    dismissConfirmation();
    updateActiveTab((tab) => {
      const annotation = materializeAnnotation(draft, tab.nextAnnotationNumber);
      return {
        ...tab,
        annotations: [...tab.annotations, annotation],
        nextAnnotationNumber: tab.nextAnnotationNumber + 1
      };
    });
  };

  const clearAnnotations = () => {
    dismissConfirmation();
    updateActiveTab((tab) => ({ ...tab, annotations: [] }));
  };

  const toggleViewed = (filePath: string) => {
    updateActiveTab((tab) => {
      const next = new Set(tab.viewedFiles);
      const nextCollapsed = new Set(tab.collapsedFiles);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
        nextCollapsed.add(filePath);
      }
      return { ...tab, viewedFiles: next, collapsedFiles: nextCollapsed };
    });
  };

  const toggleCollapsed = (filePath: string) => {
    updateActiveTab((tab) => {
      const next = new Set(tab.collapsedFiles);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return { ...tab, collapsedFiles: next };
    });
  };

  const executeRerun = () => {
    if (!onRerunCommand || commandRunning) return;
    setPendingRerun(false);
    setCommandError(null);
    setCommandRunning(true);
    onRerunCommand(editingCommand);
  };

  const handleRunCommand = () => {
    if (!onRerunCommand || commandRunning) return;
    // No confirmation needed since tabs preserve existing annotations
    executeRerun();
  };

  const modalTitle = pendingFinalAction === "submit" ? "Submit review?" : "Discard review?";
  const modalConfirmLabel = pendingFinalAction === "submit" ? "Submit review" : "Discard review";
  const modalConfirmAction = pendingFinalAction === "submit" ? submitReview : cancelReview;
  const modalConfirmClassName =
    pendingFinalAction === "submit"
      ? "review-modal__confirm"
      : "review-modal__confirm review-modal__confirm--danger";

  if (!activeTab) {
    return <div className="piannotator-shell" />;
  }

  return (
    <div className="piannotator-shell">
      <ReviewBanner
        title={init.title}
        subtitle={subtitle}
        annotationCount={totalAnnotations}
        diffMode={diffMode}
        onDiffModeChange={setDiffMode}
        totalFiles={activeTab.files.length}
        viewedCount={activeTab.viewedFiles.size}
        onOpenSettings={() => { setEditingCommand(activeTab.command); setShowSettings(true); }}
        onSubmit={openSubmitConfirmation}
        onCancel={openCancelConfirmation}
        onClear={clearAnnotations}
        tabs={tabs.map((tab) => ({ id: tab.id, command: tab.command, annotationCount: tab.annotations.length }))}
        activeTabIndex={activeTabIndex}
        onTabChange={setActiveTabIndex}
      />
      {pendingFinalAction !== null ? (
        <div className="review-modal" role="presentation" onClick={dismissConfirmation}>
          <div
            className="review-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div id="review-modal-title" className="review-modal__title">
              {modalTitle}
            </div>
            {pendingFinalAction === "submit" && (
              <textarea
                className="review-modal__comment"
                placeholder="Optional overall review comment..."
                value={overallComment}
                onChange={(e) => setOverallComment(e.target.value)}
                rows={3}
              />
            )}
            <div className="review-modal__actions">
              <button type="button" onClick={dismissConfirmation}>
                Cancel
              </button>
              <button type="button" className={modalConfirmClassName} onClick={modalConfirmAction} disabled={pendingFinalAction === "submit" && !canSubmit}>
                {modalConfirmLabel} <span className="review-modal__shortcut">⌘↩</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showSettings && (
        <div className="review-modal" role="presentation" onClick={() => { setShowSettings(false); setCommandError(null); }}>
          <div
            className="review-modal__dialog review-modal__dialog--settings"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div id="settings-modal-title" className="review-modal__title">
              Settings
            </div>
            <div className="settings-modal__field">
              <label className="settings-modal__label" htmlFor="settings-command">Command</label>
              <textarea
                id="settings-command"
                className="settings-modal__command"
                value={editingCommand}
                onChange={(e) => setEditingCommand(e.target.value)}
                rows={2}
                disabled={commandRunning}
              />
            </div>
            {commandError && (
              <div className="settings-modal__error">{commandError}</div>
            )}
            {tabs.length > 1 && (
              <div className="settings-modal__field">
                <label className="settings-modal__label">Versions</label>
                <div className="settings-modal__versions">
                  {tabs.map((tab, i) => (
                    <div key={tab.id} className={`settings-modal__version${i === activeTabIndex ? " settings-modal__version--active" : ""}`}>
                      <span className="settings-modal__version-label">
                        <span className="settings-modal__version-num">{i + 1}</span>
                        <span className="settings-modal__version-cmd" title={tab.command || "(no command)"}>
                          {tab.command || "(no command)"}
                        </span>
                        {tab.annotations.length > 0 && (
                          <span className="settings-modal__version-badge">{tab.annotations.length}</span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="settings-modal__version-delete"
                        onClick={() => deleteTab(i)}
                        aria-label={`Delete version ${i + 1}`}
                        title="Delete version"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="review-modal__actions">
              <button type="button" onClick={() => { setShowSettings(false); setCommandError(null); setPendingRerun(false); }}>
                Close
              </button>
              <button
                type="button"
                className="review-modal__confirm"
                onClick={handleRunCommand}
                disabled={commandRunning || !editingCommand.trim()}
              >
                {commandRunning ? "Running..." : "Run"}
              </button>
            </div>
          </div>
        </div>
      )}
      <main className="review-body">
        <ReviewView
          files={activeTab.files}
          annotations={activeTab.annotations}
          diffMode={diffMode}
          collapsedFiles={activeTab.collapsedFiles}
          onToggleCollapsed={toggleCollapsed}
          viewedFiles={activeTab.viewedFiles}
          onToggleViewed={toggleViewed}
          shiftKeyHeld={shiftKeyHeld}
          addAnnotation={addAnnotation}
          updateComment={(annotationId, comment) => {
            updateActiveTab((tab) => ({
              ...tab,
              annotations: updateAnnotationComment(tab.annotations, annotationId, comment)
            }));
          }}
          deleteAnnotation={(annotationId) => {
            updateActiveTab((tab) => ({
              ...tab,
              annotations: removeAnnotation(tab.annotations, annotationId)
            }));
          }}
        />

        <section className="review-panel">
          <div className="review-panel__header">
            <div>
              <div className="review-panel__title">Current annotation payload</div>
              <div className="review-panel__meta">This mirrors the payload that submit sends back through Glimpse.</div>
            </div>
          </div>
          <div className="review-panel__body">
            {totalAnnotations > 0 ? (
              <div className="annotation-list">
                {tabs.flatMap((tab, tabIndex) =>
                  tab.annotations.map((annotation) => (
                    <article key={`${tabIndex}-${annotation.id}`} className="annotation-card">
                      <div className="annotation-card__header">
                        <span className="annotation-card__id">
                          {tabs.length > 1 ? `V${tabIndex + 1}/${annotation.id}` : annotation.id}
                        </span>
                        <span className="annotation-card__ref">{formatAnnotationReference(annotation)}</span>
                      </div>
                      <p className="annotation-card__comment">{truncateAnnotationSummary(annotation.comment, 120)}</p>
                    </article>
                  ))
                )}
              </div>
            ) : (
              <p className="empty-state">
                Use the inline plus button to add single-line diff comments.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
