import { useEffect, useMemo, useRef, useState } from "react";
import type { Annotation, DiffAnnotation, DiffAnnotationDraft, DiffAnnotationLineSource, ReviewFile } from "../types.js";
import { DiffPanel } from "./DiffPanel.js";
import { FileTree } from "./FileTree.js";
import { buildFileTree } from "./file-tree-data.js";
import type { RangeAnchor } from "./range-selection.js";

interface ReviewViewProps {
  files: ReviewFile[];
  annotations: Annotation[];
  shiftKeyHeld: boolean;
  addDiffAnnotation: (draft: DiffAnnotationDraft) => void;
  updateComment: (annotationId: string, comment: string) => void;
  deleteAnnotation: (annotationId: string) => void;
}

interface FileScopedRangeAnchor extends RangeAnchor {
  filePath: string;
}

export function ReviewView({ files, annotations, shiftKeyHeld, addDiffAnnotation, updateComment, deleteAnnotation }: ReviewViewProps) {
  const diffAnnotations = annotations.filter((annotation): annotation is DiffAnnotation => annotation.kind === "diff");
  const [activeFilePath, setActiveFilePath] = useState(files[0]?.displayPath ?? "");
  const [rangeAnchor, setRangeAnchor] = useState<FileScopedRangeAnchor | null>(null);
  const panelRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!files.some((file) => file.displayPath === activeFilePath)) {
      setActiveFilePath(files[0]?.displayPath ?? "");
    }
  }, [activeFilePath, files]);

  useEffect(() => {
    if (rangeAnchor && !files.some((file) => file.displayPath === rangeAnchor.filePath)) {
      setRangeAnchor(null);
    }
  }, [files, rangeAnchor]);

  useEffect(() => {
    if (files.length <= 1) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
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
  }, [files]);

  const annotationsByFile = useMemo(() => {
    const grouped = new Map<string, DiffAnnotation[]>();
    for (const annotation of diffAnnotations) {
      const existing = grouped.get(annotation.filePath) ?? [];
      existing.push(annotation);
      grouped.set(annotation.filePath, existing);
    }
    return grouped;
  }, [diffAnnotations]);

  const fileTreeNodes = useMemo(() => buildFileTree(files, diffAnnotations), [diffAnnotations, files]);
  const showFileTree = files.length > 1;

  if (!files[0]) {
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
        {files.map((file) => (
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
    panelRefs.current.get(filePath)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
