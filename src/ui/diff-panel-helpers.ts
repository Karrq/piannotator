import { DiffFile } from "@git-diff-view/react";
import type { ReviewFile, DiffAnnotation } from "../types.js";

export interface DiffThreadData {
  comments: DiffAnnotation[];
}

export interface DiffExtendData {
  oldFile?: Record<string, { data: DiffThreadData }>;
  newFile?: Record<string, { data: DiffThreadData }>;
}

export function createDiffViewFile(file: ReviewFile): DiffFile {
  const diffFile = DiffFile.createInstance({
    oldFile: {
      fileName: file.oldPath === "/dev/null" ? null : file.oldPath,
      fileLang: detectFileLanguage(file.oldPath === "/dev/null" ? file.newPath : file.oldPath),
      content: null
    },
    newFile: {
      fileName: file.newPath === "/dev/null" ? null : file.newPath,
      fileLang: detectFileLanguage(file.newPath === "/dev/null" ? file.oldPath : file.newPath),
      content: null
    },
    hunks: [file.rawDiff]
  });

  diffFile.initTheme("dark");
  diffFile.init();
  diffFile.buildUnifiedDiffLines();
  return diffFile;
}

export function buildDiffExtendData(annotations: DiffAnnotation[]): DiffExtendData {
  const extendData: DiffExtendData = {
    oldFile: {},
    newFile: {}
  };

  for (const annotation of annotations) {
    const target = annotation.lineSource === "old" ? extendData.oldFile : extendData.newFile;
    const key = String(annotation.lineStart);
    const existing = target?.[key];
    const comments = existing ? [...existing.data.comments, annotation] : [annotation];
    if (target) {
      target[key] = { data: { comments } };
    }
  }

  if (Object.keys(extendData.oldFile ?? {}).length === 0) {
    delete extendData.oldFile;
  }

  if (Object.keys(extendData.newFile ?? {}).length === 0) {
    delete extendData.newFile;
  }

  return extendData;
}

function detectFileLanguage(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (extension) {
    case "ts":
      return "typescript";
    case "tsx":
      return "tsx";
    case "js":
      return "javascript";
    case "jsx":
      return "jsx";
    case "json":
      return "json";
    case "md":
      return "markdown";
    case "css":
      return "css";
    case "html":
      return "xml";
    case "sh":
      return "bash";
    case "yml":
    case "yaml":
      return "yaml";
    default:
      return "plaintext";
  }
}
