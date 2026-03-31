import { useEffect, useMemo, useRef, useState } from "react";
import type { Annotation, AnnotationDraft, ReviewFile } from "../types.js";
import { DiffPanel } from "./DiffPanel.js";
import { FileTree } from "./FileTree.js";
import { buildFileTree, sortFilesForTreeOrder } from "./file-tree-data.js";
import { WindowVirtualizer } from "./WindowVirtualizer.js";

interface ReviewViewProps {
  files: ReviewFile[];
  annotations: Annotation[];
  diffMode: "unified" | "split";
  diffFont?: string;
  collapsedFiles: Set<string>;
  onToggleCollapsed: (filePath: string) => void;
  viewedFiles: Set<string>;
  onToggleViewed: (filePath: string) => void;
  addAnnotation: (draft: AnnotationDraft) => void;
  updateComment: (annotationId: string, comment: string) => void;
  deleteAnnotation: (annotationId: string) => void;
}

export function ReviewView({ files, annotations, diffMode, diffFont, collapsedFiles, onToggleCollapsed, viewedFiles, onToggleViewed, addAnnotation, updateComment, deleteAnnotation }: ReviewViewProps) {
  const orderedFiles = useMemo(() => sortFilesForTreeOrder(files), [files]);
  const [activeFilePath, setActiveFilePath] = useState(orderedFiles[0]?.displayPath ?? "");
  const panelRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingScrollTargetRef = useRef<string | null>(null);
  const pendingScrollTimerRef = useRef<number | null>(null);
  const scrollAbortRef = useRef(0); // incremented to cancel stale tryScroll loops
  const activeFilePathRef = useRef(activeFilePath);

  const finishPendingScroll = () => {
    const target = pendingScrollTargetRef.current;
    pendingScrollTargetRef.current = null;

    if (pendingScrollTimerRef.current !== null) {
      window.clearTimeout(pendingScrollTimerRef.current);
      pendingScrollTimerRef.current = null;
    }

    if (target) {
      setActiveFilePath(target);
    }
  };

  const schedulePendingScrollFinish = () => {
    if (pendingScrollTargetRef.current === null) {
      return;
    }

    if (pendingScrollTimerRef.current !== null) {
      window.clearTimeout(pendingScrollTimerRef.current);
    }

    pendingScrollTimerRef.current = window.setTimeout(finishPendingScroll, 140);
  };

  useEffect(() => {
    activeFilePathRef.current = activeFilePath;
  }, [activeFilePath]);

  useEffect(() => {
    if (!orderedFiles.some((file) => file.displayPath === activeFilePath)) {
      setActiveFilePath(orderedFiles[0]?.displayPath ?? "");
    }
  }, [activeFilePath, orderedFiles]);

  // When a file is collapsed, scroll so its header stays visible
  const prevCollapsedRef = useRef(collapsedFiles);
  useEffect(() => {
    const prev = prevCollapsedRef.current;
    prevCollapsedRef.current = collapsedFiles;
    // Find a file that was just collapsed (in new set but not in previous)
    for (const filePath of collapsedFiles) {
      if (!prev.has(filePath)) {
        const element = panelRefs.current.get(filePath);
        if (element) {
          // Wait for the virtualizer's scrollFix (runs in rAF) to settle,
          // then ensure the collapsed file's header is still visible.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const rect = element.getBoundingClientRect();
              if (rect.top < 68 || rect.bottom < 0) {
                const top = Math.max(0, window.scrollY + rect.top - 68);
                window.scrollTo({ top, behavior: "smooth" });
              }
            });
          });
        }
        break;
      }
    }
  }, [collapsedFiles]);

  // Scroll to the active file when diff mode changes to preserve context
  const prevDiffModeRef = useRef(diffMode);
  useEffect(() => {
    if (prevDiffModeRef.current !== diffMode) {
      prevDiffModeRef.current = diffMode;
      const element = panelRefs.current.get(activeFilePath);
      if (element) {
        const top = Math.max(0, window.scrollY + element.getBoundingClientRect().top - 68);
        window.scrollTo({ top, behavior: "smooth" });
      }
    }
  }, [diffMode, activeFilePath]);

  useEffect(() => {
    window.addEventListener("scroll", schedulePendingScrollFinish, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedulePendingScrollFinish);

      if (pendingScrollTimerRef.current !== null) {
        window.clearTimeout(pendingScrollTimerRef.current);
        pendingScrollTimerRef.current = null;
      }

      pendingScrollTargetRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (orderedFiles.length <= 1) return;

    let frameId: number | null = null;

    const updateActiveFileFromScroll = () => {
      frameId = null;

      if (pendingScrollTargetRef.current !== null) {
        return;
      }

      const anchorY = 96;
      const panels = orderedFiles
        .map((file) => {
          const element = panelRefs.current.get(file.displayPath);
          if (!element || element.childElementCount === 0) {
            return null;
          }

          const rect = element.getBoundingClientRect();
          return { filePath: file.displayPath, rect };
        })
        .filter((panel): panel is { filePath: string; rect: DOMRect } => panel !== null);

      if (panels.length === 0) {
        return;
      }

      const containingPanel = panels.find((panel) => panel.rect.top <= anchorY && panel.rect.bottom > anchorY);
      const nextPanel = containingPanel
        ?? panels.filter((panel) => panel.rect.bottom > anchorY).sort((left, right) => left.rect.top - right.rect.top)[0]
        ?? panels[panels.length - 1];

      if (nextPanel.filePath !== activeFilePathRef.current) {
        setActiveFilePath(nextPanel.filePath);
      }
    };

    const scheduleUpdate = () => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(updateActiveFileFromScroll);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [orderedFiles]);

  const annotationsByFile = useMemo(() => {
    const grouped = new Map<string, Annotation[]>();
    for (const annotation of annotations) {
      const existing = grouped.get(annotation.filePath) ?? [];
      existing.push(annotation);
      grouped.set(annotation.filePath, existing);
    }
    return grouped;
  }, [annotations]);

  const fileTreeNodes = useMemo(() => buildFileTree(orderedFiles, annotations), [annotations, orderedFiles]);
  const showFileTree = orderedFiles.length > 1;
  const [treeWidth, setTreeWidth] = useState(280);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const resizingRef = useRef(false);

  if (!orderedFiles[0]) {
    return (
      <section className="review-panel">
        <div className="review-panel__header">
          <div>
            <div className="review-panel__title">Diff review preview</div>
            <div className="review-panel__meta">No parsed diff files were available for rendering.</div>
          </div>
        </div>
        <div className="review-panel__body">
          <p className="empty-state">The request was detected as diff mode, but no per-file hunks were parsed.</p>
        </div>
      </section>
    );
  }

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = treeWidth;
    const maxWidth = Math.floor(window.innerWidth * 0.5);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const next = Math.max(120, Math.min(startWidth + delta, maxWidth));
      setTreeWidth(next);
    };

    const onMouseUp = () => {
      resizingRef.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const gridStyle = showFileTree
    ? { gridTemplateColumns: treeCollapsed ? "48px minmax(0, 1fr)" : `${treeWidth}px minmax(0, 1fr)` }
    : undefined;

  return (
    <WindowVirtualizer>
      <div className={showFileTree ? "review-view-layout" : "review-file-list"} style={gridStyle}>
        {showFileTree ? (
          <div className={treeCollapsed ? "file-tree-wrapper--collapsed" : "file-tree-wrapper"}>
            <FileTree
              nodes={fileTreeNodes}
              activeFilePath={activeFilePath}
              onSelectFile={scrollToFile}
              collapsed={treeCollapsed}
              onToggleCollapse={() => setTreeCollapsed((c) => !c)}
            />
            {!treeCollapsed && <div className="file-tree-resize-handle" onMouseDown={startResize} />}
          </div>
        ) : null}
        <VirtualizedFileList
          orderedFiles={orderedFiles}
          activeFilePath={activeFilePath}
          scrollTargetPath={pendingScrollTargetRef.current}
          annotationsByFile={annotationsByFile}
          diffMode={diffMode}
          diffFont={diffFont}
          collapsedFiles={collapsedFiles}
          onToggleCollapsed={onToggleCollapsed}
          viewedFiles={viewedFiles}
          onToggleViewed={onToggleViewed}
          addAnnotation={addAnnotation}
          updateComment={updateComment}
          deleteAnnotation={deleteAnnotation}
          panelRefs={panelRefs}
        />
      </div>
    </WindowVirtualizer>
  );

  function scrollToFile(filePath: string) {
    pendingScrollTargetRef.current = filePath;
    const wasAlreadyMounted = (panelRefs.current.get(filePath)?.childElementCount ?? 0) > 0;
    // Cancel any in-flight scroll polling from a previous click.
    const scrollId = ++scrollAbortRef.current;
    setActiveFilePath(filePath);

    let attempts = 0;
    const tryScroll = () => {
      if (scrollAbortRef.current !== scrollId) return;

      const element = panelRefs.current.get(filePath);
      if (element && element.childElementCount > 0) {
        element.scrollIntoView({
          behavior: wasAlreadyMounted ? "smooth" : "instant",
          block: "start",
        });
        // For new mounts, do a correction pass after content settles.
        if (!wasAlreadyMounted) {
          setTimeout(() => {
            if (scrollAbortRef.current !== scrollId) return;
            const el = panelRefs.current.get(filePath);
            if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
            // Let schedulePendingScrollFinish handle the finish
            // after scroll events stop (keeps observer suppressed).
          }, 150);
        }
        // Don't call finishPendingScroll here - let the scroll event
        // listener's schedulePendingScrollFinish handle it once scrolling
        // actually stops. This keeps the observer suppressed during
        // the entire smooth scroll animation.
        return;
      }
      if (++attempts < 20) {
        requestAnimationFrame(tryScroll);
      } else {
        finishPendingScroll();
      }
    };
    requestAnimationFrame(tryScroll);
  }
}

function toFileSectionId(filePath: string): string {
  return `file-${filePath.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

// How many files before/after the active file to keep mounted.
const RENDER_WINDOW = 2;
// Minimum placeholder height for files that haven't been measured yet.
const MIN_PLACEHOLDER_HEIGHT = 80;

interface VirtualizedFileListProps {
  orderedFiles: ReviewFile[];
  activeFilePath: string;
  /** When set, this file is force-included in the render window (for scroll-to). */
  scrollTargetPath: string | null;
  annotationsByFile: Map<string, Annotation[]>;
  diffMode: "unified" | "split";
  diffFont?: string;
  collapsedFiles: Set<string>;
  onToggleCollapsed: (filePath: string) => void;
  viewedFiles: Set<string>;
  onToggleViewed: (filePath: string) => void;
  addAnnotation: (draft: AnnotationDraft) => void;
  updateComment: (annotationId: string, comment: string) => void;
  deleteAnnotation: (annotationId: string) => void;
  panelRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

function VirtualizedFileList({
  orderedFiles,
  activeFilePath,
  scrollTargetPath,
  annotationsByFile,
  diffMode,
  diffFont,
  collapsedFiles,
  onToggleCollapsed,
  viewedFiles,
  onToggleViewed,
  addAnnotation,
  updateComment,
  deleteAnnotation,
  panelRefs,
}: VirtualizedFileListProps) {
  // Once a file enters the render window, it stays mounted.
  const mountedRef = useRef(new Set<string>());

  const activeIndex = orderedFiles.findIndex((f) => f.displayPath === activeFilePath);
  const targetIndex = scrollTargetPath
    ? orderedFiles.findIndex((f) => f.displayPath === scrollTargetPath)
    : -1;

  let windowStart = Math.max(0, activeIndex - RENDER_WINDOW);
  let windowEnd = Math.min(orderedFiles.length - 1, activeIndex + RENDER_WINDOW);
  if (targetIndex >= 0) {
    windowStart = Math.min(windowStart, Math.max(0, targetIndex - RENDER_WINDOW));
    windowEnd = Math.max(windowEnd, Math.min(orderedFiles.length - 1, targetIndex + RENDER_WINDOW));
  }

  for (let i = windowStart; i <= windowEnd; i++) {
    mountedRef.current.add(orderedFiles[i].displayPath);
  }

  return (
    <div className="review-file-list">
      {orderedFiles.map((file) => {
        const shouldMount = mountedRef.current.has(file.displayPath);

        if (!shouldMount) {
          return (
            <div
              key={file.displayPath}
              id={toFileSectionId(file.displayPath)}
              data-file-path={file.displayPath}
              style={{ minHeight: MIN_PLACEHOLDER_HEIGHT }}
              ref={(element) => {
                if (element) panelRefs.current.set(file.displayPath, element);
                else panelRefs.current.delete(file.displayPath);
              }}
            />
          );
        }

        return (
          <div
            key={file.displayPath}
            id={toFileSectionId(file.displayPath)}
            data-file-path={file.displayPath}
            ref={(element) => {
              if (element) panelRefs.current.set(file.displayPath, element);
              else panelRefs.current.delete(file.displayPath);
            }}
          >
            <DiffPanel
              file={file}
              annotations={annotationsByFile.get(file.displayPath) ?? []}
              diffStyle={diffMode}
              diffFont={diffFont}
              collapsed={collapsedFiles.has(file.displayPath)}
              onToggleCollapse={() => onToggleCollapsed(file.displayPath)}
              isViewed={viewedFiles.has(file.displayPath)}
              onToggleViewed={() => onToggleViewed(file.displayPath)}
              onAddAnnotation={addAnnotation}
              onUpdateAnnotation={updateComment}
              onDeleteAnnotation={deleteAnnotation}
            />
          </div>
        );
      })}
    </div>
  );
}


