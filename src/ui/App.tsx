import { useEffect, useMemo, useRef, useState } from "react";
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
  const [pendingFinalAction, setPendingFinalAction] = useState<PendingFinalAction>(null);
  const [diffMode, setDiffMode] = useState<"unified" | "split">("unified");
  const [overallComment, setOverallComment] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [editingCommand, setEditingCommand] = useState(init.command ?? "");
  const editingCommandRef = useRef(editingCommand);
  editingCommandRef.current = editingCommand;
  const [commandError, setCommandError] = useState<string | null>(null);
  const [commandRunning, setCommandRunning] = useState(false);
  const [pendingRerun, setPendingRerun] = useState(false);
  const [diffFont, setDiffFont] = useState(() => localStorage.getItem("piannotator-diff-font") || "");


  // Create initial tab on mount
  useEffect(() => {
    addTab(init.command ?? "", init.content, init.files);
  }, []);

  const activeTab = tabs[activeTabIndex];

  const totalAnnotations = useMemo(() => tabs.reduce((sum, tab) => sum + tab.annotations.length, 0), [tabs]);

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
      annotations: annotationsToDrafts(tab.annotations),
      files: tab.files
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

      // Clipboard workaround for Glimpse WKWebView (no native Edit menu)
      if (event.metaKey && !event.shiftKey) {
        switch (event.key) {
          case "c": {
            const sel = window.getSelection()?.toString();
            if (sel) navigator.clipboard.writeText(sel);
            event.preventDefault();
            return;
          }
          case "v": {
            navigator.clipboard.readText().then((text) => {
              const active = document.activeElement;
              if (active instanceof HTMLTextAreaElement) {
                const start = active.selectionStart;
                const end = active.selectionEnd;
                active.value = active.value.slice(0, start) + text + active.value.slice(end);
                active.selectionStart = active.selectionEnd = start + text.length;
                active.dispatchEvent(new Event("input", { bubbles: true }));
              }
            });
            event.preventDefault();
            return;
          }
          case "x": {
            const sel = window.getSelection()?.toString();
            if (sel) navigator.clipboard.writeText(sel);
            document.execCommand("delete");
            event.preventDefault();
            return;
          }
          case "a":
            document.execCommand("selectAll");
            event.preventDefault();
            return;
          case "z":
            document.execCommand("undo");
            event.preventDefault();
            return;
        }
      }
      if (event.metaKey && event.shiftKey && event.key === "z") {
        document.execCommand("redo");
        event.preventDefault();
        return;
      }

      // Cmd+R to reload (useful for dev/testing in Glimpse)
      if (event.metaKey && event.key === "r") {
        event.preventDefault();
        location.reload();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
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
        activeAnnotationCount={activeTab.annotations.length}
        totalAnnotationCount={totalAnnotations}
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
            <div className="settings-modal__field">
              <label className="settings-modal__label" htmlFor="settings-font">Diff font family</label>
              <input
                id="settings-font"
                type="text"
                className="settings-modal__command"
                value={diffFont}
                onChange={(e) => {
                  const value = e.target.value;
                  setDiffFont(value);
                  if (value) {
                    localStorage.setItem("piannotator-diff-font", value);
                  } else {
                    localStorage.removeItem("piannotator-diff-font");
                  }
                }}
                placeholder="e.g. JetBrains Mono, Fira Code, monospace"
              />
            </div>
            {commandError && (
              <div className="settings-modal__error">{commandError}</div>
            )}
            <div className="review-modal__actions">
              <button type="button" onClick={() => { setShowSettings(false); setCommandError(null); setPendingRerun(false); }}>
                Close
              </button>
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="review-modal__confirm review-modal__confirm--danger"
                  onClick={() => { deleteTab(activeTabIndex); setShowSettings(false); }}
                >
                  Delete version
                </button>
              )}
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
          diffFont={diffFont}
          collapsedFiles={activeTab.collapsedFiles}
          onToggleCollapsed={toggleCollapsed}
          viewedFiles={activeTab.viewedFiles}
          onToggleViewed={toggleViewed}
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
