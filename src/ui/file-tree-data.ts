import type { Annotation, ReviewFile } from "../types.js";

export function sortFilesForTreeOrder(files: ReviewFile[]): ReviewFile[] {
  return [...files].sort((left, right) => compareFilePathsForTreeOrder(left.displayPath, right.displayPath));
}

export function compareFilePathsForTreeOrder(leftPath: string, rightPath: string): number {
  const leftSegments = leftPath.split("/");
  const rightSegments = rightPath.split("/");
  const maxLength = Math.max(leftSegments.length, rightSegments.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftSegment = leftSegments[index];
    const rightSegment = rightSegments[index];

    if (leftSegment === undefined) {
      return -1;
    }

    if (rightSegment === undefined) {
      return 1;
    }

    const leftIsDirectory = index < leftSegments.length - 1;
    const rightIsDirectory = index < rightSegments.length - 1;

    if (leftIsDirectory !== rightIsDirectory) {
      return leftIsDirectory ? -1 : 1;
    }

    const byName = leftSegment.localeCompare(rightSegment);
    if (byName !== 0) {
      return byName;
    }
  }

  return 0;
}

export interface FileTreeNodeData {
  id: string;
  name: string;
  path: string;
  kind: "directory" | "file";
  additions: number;
  deletions: number;
  annotationCount: number;
  children?: FileTreeNodeData[];
}

interface DirectoryAccumulator {
  name: string;
  path: string;
  children: Map<string, DirectoryAccumulator | FileTreeNodeData>;
}

export function buildFileTree(files: ReviewFile[], annotations: Annotation[]): FileTreeNodeData[] {
  const annotationCounts = new Map<string, number>();
  for (const annotation of annotations) {
    annotationCounts.set(annotation.filePath, (annotationCounts.get(annotation.filePath) ?? 0) + 1);
  }

  const root: DirectoryAccumulator = {
    name: "",
    path: "",
    children: new Map()
  };

  for (const file of files) {
    const segments = file.displayPath.split("/");
    let current = root;

    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      const nextPath = current.path ? `${current.path}/${segment}` : segment;
      const existing = current.children.get(segment);
      if (existing && isDirectoryAccumulator(existing)) {
        current = existing;
        continue;
      }

      const directory: DirectoryAccumulator = {
        name: segment,
        path: nextPath,
        children: new Map()
      };
      current.children.set(segment, directory);
      current = directory;
    }

    const annotationCount = annotationCounts.get(file.displayPath) ?? 0;
    const leaf: FileTreeNodeData = {
      id: file.displayPath,
      name: segments[segments.length - 1],
      path: file.displayPath,
      kind: "file",
      additions: file.additions,
      deletions: file.deletions,
      annotationCount
    };
    current.children.set(leaf.name, leaf);
  }

  return finalizeChildren(root);
}

function finalizeChildren(directory: DirectoryAccumulator): FileTreeNodeData[] {
  const result: FileTreeNodeData[] = [];

  for (const child of Array.from(directory.children.values()).sort(compareEntries)) {
    if (isDirectoryAccumulator(child)) {
      const children = finalizeChildren(child);
      result.push({
        id: `dir:${child.path}`,
        name: child.name,
        path: child.path,
        kind: "directory",
        additions: children.reduce((sum, item) => sum + item.additions, 0),
        deletions: children.reduce((sum, item) => sum + item.deletions, 0),
        annotationCount: children.reduce((sum, item) => sum + item.annotationCount, 0),
        children
      });
      continue;
    }

    result.push(child);
  }

  return result;
}

function compareEntries(left: DirectoryAccumulator | FileTreeNodeData, right: DirectoryAccumulator | FileTreeNodeData): number {
  const leftIsDirectory = isDirectoryAccumulator(left);
  const rightIsDirectory = isDirectoryAccumulator(right);
  if (leftIsDirectory !== rightIsDirectory) {
    return leftIsDirectory ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}

function isDirectoryAccumulator(value: DirectoryAccumulator | FileTreeNodeData): value is DirectoryAccumulator {
  return value.children instanceof Map;
}
