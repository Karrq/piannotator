export const ANNOTATION_SUMMARY_LIMIT = 50;

export type AnnotationLineSource = "old" | "new";
export type ReviewFileChangeType = "modified" | "added" | "deleted" | "renamed";

export interface ReviewSourceCommand {
  kind: "command";
  title: string;
  command: string;
  content: string;
  exitCode: number | undefined;
}

export type ReviewSource = ReviewSourceCommand;

export interface ReviewFileLine {
  kind: "context" | "add" | "del";
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface ReviewFileHunk {
  header: string;
  lines: ReviewFileLine[];
}

export interface ReviewFile {
  oldPath: string;
  newPath: string;
  displayPath: string;
  changeType: ReviewFileChangeType;
  rawDiff: string;
  rawHunks: string;
  additions: number;
  deletions: number;
  hunks: ReviewFileHunk[];
}

interface AnnotationBase {
  lineStart: number;
  lineEnd?: number;
  comment: string;
}

export interface AnnotationDraft extends AnnotationBase {
  filePath: string;
  lineSource: AnnotationLineSource;
  versionIndex?: number;
}

interface AnnotationMetadata {
  id: string;
  summary: string;
}

export type Annotation = AnnotationDraft & AnnotationMetadata;

export interface ReviewVersion {
  command?: string;
  files: ReviewFile[];
}

export interface Review {
  id: string;
  title: string;
  source: ReviewSource;
  files: ReviewFile[];
  annotations: Annotation[];
  versions?: ReviewVersion[];
  overallComment?: string;
  finalCommand?: string;
  createdAt: string;
}

export interface AnnotateState {
  reviews: Review[];
  nextReviewId: number;
}

export interface AnnotateToolDetails extends AnnotateState {
  action: "request" | "detail";
  cancelled?: boolean;
  review?: Review;
  annotation?: Annotation;
  error?: string;
}

export interface DiffContextLine extends ReviewFileLine {
  annotated: boolean;
}

export interface ReviewClientRequest {
  title: string;
  content: string;
  files: ReviewFile[];
  command?: string;
}

export interface ReviewClientResult {
  versions: ReviewBridgeVersion[];
  overallComment?: string;
}

export interface ReviewBridgeInit {
  title: string;
  content: string;
  files: ReviewFile[];
  annotations: AnnotationDraft[];
  command?: string;
}

export interface ReviewBridgeVersion {
  command?: string;
  annotations: AnnotationDraft[];
}

export interface ReviewBridgeSubmitMessage {
  type: "submit";
  versions: ReviewBridgeVersion[];
  overallComment?: string;
}

export interface ReviewBridgeCancelMessage {
  type: "cancel";
}

export interface ReviewBridgeRerunMessage {
  type: "rerun";
  command: string;
}

export type ReviewBridgeMessage = ReviewBridgeSubmitMessage | ReviewBridgeCancelMessage | ReviewBridgeRerunMessage;

export interface ReviewBridgeUpdateMessage {
  type: "update";
  content: string;
  files: ReviewFile[];
}

export interface ReviewBridgeRerunErrorMessage {
  type: "rerun-error";
  error: string;
}

export type ReviewBridgeExtensionMessage = ReviewBridgeUpdateMessage | ReviewBridgeRerunErrorMessage;

export function truncateAnnotationSummary(comment: string, limit = ANNOTATION_SUMMARY_LIMIT): string {
  const normalized = comment.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

export function normalizeRange(lineStart: number, lineEnd?: number): { lineStart: number; lineEnd?: number } {
  if (lineEnd === undefined || lineEnd === lineStart) {
    return { lineStart };
  }

  return {
    lineStart: Math.min(lineStart, lineEnd),
    lineEnd: Math.max(lineStart, lineEnd)
  };
}

export function formatAnnotationReference(annotation: Annotation | AnnotationDraft): string {
  const normalized = normalizeRange(annotation.lineStart, annotation.lineEnd);
  if (normalized.lineEnd === undefined) {
    return `${annotation.filePath}:${normalized.lineStart}`;
  }

  return `${annotation.filePath}:${normalized.lineStart}-${normalized.lineEnd}`;
}
