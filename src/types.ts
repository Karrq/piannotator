export const ANNOTATION_SUMMARY_LIMIT = 50;

export type ReviewMode = "text" | "diff";
export type DiffAnnotationLineSource = "old" | "new";
export type ReviewFileChangeType = "modified" | "added" | "deleted" | "renamed";

export interface ReviewSourceText {
  kind: "text";
  title: string;
  content: string;
}

export interface ReviewSourceCommand {
  kind: "command";
  title: string;
  command: string;
  content: string;
  exitCode: number | undefined;
}

export type ReviewSource = ReviewSourceText | ReviewSourceCommand;

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

export interface TextAnnotationDraft extends AnnotationBase {
  kind: "text";
  lineSource: "text";
}

export interface DiffAnnotationDraft extends AnnotationBase {
  kind: "diff";
  filePath: string;
  lineSource: DiffAnnotationLineSource;
}

export type AnnotationDraft = TextAnnotationDraft | DiffAnnotationDraft;

interface AnnotationMetadata {
  id: string;
  summary: string;
}

export type TextAnnotation = TextAnnotationDraft & AnnotationMetadata;
export type DiffAnnotation = DiffAnnotationDraft & AnnotationMetadata;
export type Annotation = TextAnnotation | DiffAnnotation;

export interface Review {
  id: string;
  title: string;
  mode: ReviewMode;
  source: ReviewSource;
  files: ReviewFile[];
  annotations: Annotation[];
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

export interface TextContextLine {
  lineNumber: number;
  text: string;
  annotated: boolean;
}

export interface DiffContextLine extends ReviewFileLine {
  annotated: boolean;
}

interface ReviewClientRequestBase {
  title: string;
  content: string;
  command?: string;
}

export interface TextReviewClientRequest extends ReviewClientRequestBase {
  mode: "text";
  files: [];
}

export interface DiffReviewClientRequest extends ReviewClientRequestBase {
  mode: "diff";
  files: ReviewFile[];
}

export type ReviewClientRequest = TextReviewClientRequest | DiffReviewClientRequest;

export interface ReviewClientResult {
  annotations: AnnotationDraft[];
  overallComment?: string;
  command?: string;
}

export interface ReviewBridgeInit {
  title: string;
  mode: ReviewMode;
  content: string;
  files: ReviewFile[];
  annotations: AnnotationDraft[];
  command?: string;
}

export interface ReviewBridgeSubmitMessage {
  type: "submit";
  annotations: AnnotationDraft[];
  overallComment?: string;
  command?: string;
}

export interface ReviewBridgeCancelMessage {
  type: "cancel";
}

export interface ReviewBridgeRerunMessage {
  type: "rerun";
  command: string;
}

export type ReviewBridgeMessage = ReviewBridgeSubmitMessage | ReviewBridgeCancelMessage | ReviewBridgeRerunMessage;

// Extension -> UI messages
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

export function isDiffAnnotation(annotation: Annotation | AnnotationDraft): annotation is DiffAnnotation | DiffAnnotationDraft {
  return annotation.kind === "diff";
}

export function isTextAnnotation(annotation: Annotation | AnnotationDraft): annotation is TextAnnotation | TextAnnotationDraft {
  return annotation.kind === "text";
}

export function formatTextReference(lineStart: number, lineEnd?: number): string {
  const normalized = normalizeRange(lineStart, lineEnd);
  if (normalized.lineEnd === undefined) {
    return `L${normalized.lineStart}`;
  }

  return `L${normalized.lineStart}-${normalized.lineEnd}`;
}

export function formatDiffReference(filePath: string, lineStart: number, lineEnd?: number): string {
  const normalized = normalizeRange(lineStart, lineEnd);
  if (normalized.lineEnd === undefined) {
    return `${filePath}:${normalized.lineStart}`;
  }

  return `${filePath}:${normalized.lineStart}-${normalized.lineEnd}`;
}

export function formatAnnotationReference(annotation: Annotation): string {
  if (isDiffAnnotation(annotation)) {
    return formatDiffReference(annotation.filePath, annotation.lineStart, annotation.lineEnd);
  }

  return formatTextReference(annotation.lineStart, annotation.lineEnd);
}
