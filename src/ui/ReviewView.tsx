import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { DiffModeEnum } from "@git-diff-view/react";
import type { Annotation, DiffAnnotation, DiffAnnotationDraft, DiffAnnotationLineSource, ReviewFile } from "../types.js";
import { DiffPanel } from "./DiffPanel.js";
import { FileTree } from "./FileTree.js";
import { buildFileTree, sortFilesForTreeOrder } from "./file-tree-data.js";
import type { RangeAnchor } from "./range-selection.js";

interface ReviewViewProps {
  files: ReviewFile[];
  annotations: Annotation[];
  diffMode: DiffModeEnum;
  collapsedFiles: Set<string>;
  onToggleCollapsed: (filePath: string) => void;
  viewedFiles: Set<string>;
  onToggleViewed: (filePath: string) => void;
  shiftKeyHeld: boolean;
  addDiffAnnotation: (draft: DiffAnnotationDraft) => void;
  updateComment: (annotationId: string, comment: string) => void;
  deleteAnnotation: (annotationId: string) => void;
}

interface FileScopedRangeAnchor extends RangeAnchor {
  filePath: string;
}

export function ReviewView({ files, annotations, diffMode, collapsedFiles, onToggleCollapsed, viewedFiles, onToggleViewed, shiftKeyHeld, addDiffAnnotation, updateComment, deleteAnnotation }: ReviewViewProps) {
  const diffAnnotations = annotations.filter((annotation): annotation is DiffAnnotation => annotation.kind === "diff");
  const orderedFiles = useMemo(() => sortFilesForTreeOrder(files), [files]);
  const [activeFilePath, setActiveFilePath] = useState(orderedFiles[0]?.displayPath ?? "");
  const [rangeAnchor, setRangeAnchor] = useState<FileScopedRangeAnchor | null>(null);
  const panelRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingScrollTargetRef = useRef<string | null>(null);
  const pendingScrollTimerRef = useRef<number | null>(null);

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
          const rect = element.getBoundingClientRect();
          // Only scroll if the header is above the viewport (content shifted up)
          if (rect.top < 68) {
            const top = Math.max(0, window.scrollY + rect.top - 68);
            window.scrollTo({ top, behavior: "smooth" });
          }
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
    if (rangeAnchor && !orderedFiles.some((file) => file.displayPath === rangeAnchor.filePath)) {
      setRangeAnchor(null);
    }
  }, [orderedFiles, rangeAnchor]);

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
    if (orderedFiles.length <= 1) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (pendingScrollTargetRef.current !== null) {
          return;
        }

        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        const filePath = visible?.target.getAttribute("data-file-path");
        if (filePath) {
          setActiveFilePath(filePath);
        }
      },
      {
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0.2, 0.45, 0.7]
      }
    );

    for (const element of panelRefs.current.values()) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [orderedFiles]);

  const annotationsByFile = useMemo(() => {
    const grouped = new Map<string, DiffAnnotation[]>();
    for (const annotation of diffAnnotations) {
      const existing = grouped.get(annotation.filePath) ?? [];
      existing.push(annotation);
      grouped.set(annotation.filePath, existing);
    }
    return grouped;
  }, [diffAnnotations]);

  const fileTreeNodes = useMemo(() => buildFileTree(orderedFiles, diffAnnotations), [diffAnnotations, orderedFiles]);
  const showFileTree = orderedFiles.length > 1;

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

  return (
    <div className={showFileTree ? "review-view-layout" : "review-file-list"}>
      {showFileTree ? <FileTree nodes={fileTreeNodes} activeFilePath={activeFilePath} onSelectFile={scrollToFile} /> : null}
      <div className="review-file-list">
        {orderedFiles.map((file) => (
          <div
            key={file.displayPath}
            id={toFileSectionId(file.displayPath)}
            data-file-path={file.displayPath}
            ref={(element) => {
              if (element) {
                panelRefs.current.set(file.displayPath, element);
              } else {
                panelRefs.current.delete(file.displayPath);
              }
            }}
          >
            <DiffPanel
              file={file}
              annotations={annotationsByFile.get(file.displayPath) ?? []}
              diffMode={diffMode}
              collapsed={collapsedFiles.has(file.displayPath)}
              onToggleCollapse={() => onToggleCollapsed(file.displayPath)}
              isViewed={viewedFiles.has(file.displayPath)}
              onToggleViewed={() => onToggleViewed(file.displayPath)}
              shiftKeyHeld={shiftKeyHeld}
              rangeAnchor={toLocalAnchor(rangeAnchor, file.displayPath)}
              onRangeAnchorChange={(nextAnchor) => {
                setRangeAnchor(nextAnchor ? { ...nextAnchor, filePath: file.displayPath } : null);
              }}
              onAddAnnotation={addDiffAnnotation}
              onUpdateAnnotation={updateComment}
              onDeleteAnnotation={deleteAnnotation}
            />
          </div>
        ))}
      </div>
    </div>
  );

  function scrollToFile(filePath: string) {
    setActiveFilePath(filePath);
    pendingScrollTargetRef.current = filePath;
    schedulePendingScrollFinish();

    const element = panelRefs.current.get(filePath);
    if (!element) {
      return;
    }

    const top = Math.max(0, window.scrollY + element.getBoundingClientRect().top - 68);
    window.scrollTo({ top, behavior: "smooth" });
  }
}

function toFileSectionId(filePath: string): string {
  return `file-${filePath.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

function toLocalAnchor(anchor: FileScopedRangeAnchor | null, filePath: string): RangeAnchor | null {
  if (!anchor || anchor.filePath !== filePath) {
    return null;
  }

  return {
    lineNumber: anchor.lineNumber,
    lineSource: anchor.lineSource as DiffAnnotationLineSource
  };
}
