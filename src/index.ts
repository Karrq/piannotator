import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { extractDiffContext, isUnifiedDiff, parseDiff } from "./diff-parser.js";
import type { ReviewClient } from "./review-client.js";
import { GlimpseReviewClient } from "./review-client-glimpse.js";
import { StubReviewClient } from "./review-client-stub.js";
import {
  formatAnnotationReference,
  formatTextReference,
  isDiffAnnotation,
  normalizeRange,
  truncateAnnotationSummary,
  type AnnotateState,
  type AnnotateToolDetails,
  type Annotation,
  type AnnotationDraft,
  type DiffAnnotation,
  type DiffReviewClientRequest,
  type Review,
  type ReviewFile,
  type ReviewMode,
  type ReviewSource,
  type TextAnnotation,
  type TextReviewClientRequest
} from "./types.js";

const AnnotateParamsSchema = Type.Object(
  {
    action: StringEnum(["request", "overview", "detail"] as const, {
      description: "Tool action: request starts a review, overview lists annotations, detail returns one annotation."
    }),
    content: Type.Optional(
      Type.String({ description: "Raw text to review. Use with action=request instead of command." })
    ),
    command: Type.Optional(
      Type.String({ description: "Shell command whose output should be reviewed. Use with action=request instead of content." })
    ),
    title: Type.Optional(Type.String({ description: "Short review title. Use with action=request." })),
    reviewId: Type.Optional(
      Type.String({ description: "Review ID returned by request. Use with action=overview or action=detail." })
    ),
    annotationId: Type.Optional(
      Type.String({ description: "Annotation ID within the review. Use with action=detail." })
    )
  },
  { additionalProperties: false }
);

type AnnotateParams = Static<typeof AnnotateParamsSchema>;

type RequestTextInput = {
  action: "request";
  content: string;
  title?: string;
};

type RequestCommandInput = {
  action: "request";
  command: string;
  title?: string;
};

type OverviewInput = {
  action: "overview";
  reviewId: string;
};

type DetailInput = {
  action: "detail";
  reviewId: string;
  annotationId: string;
};

export default function (pi: ExtensionAPI) {
  let reviews: Review[] = [];
  let nextReviewId = 1;
  const reviewClient: ReviewClient = createReviewClient();

  const reconstructState = (ctx: ExtensionContext) => {
    reviews = [];
    nextReviewId = 1;

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "message") {
        continue;
      }

      const message = entry.message;
      if (message.role !== "toolResult" || message.toolName !== "annotate") {
        continue;
      }

      const details = message.details as AnnotateToolDetails | undefined;
      if (!details) {
        continue;
      }

      if (details.reviews !== undefined) {
        reviews = details.reviews;
      }

      if (details.nextReviewId !== undefined) {
        nextReviewId = details.nextReviewId;
      }
    }
  };

  pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_switch", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_fork", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

  pi.registerTool({
    name: "annotate",
    label: "Annotate",
    description: "Request user annotations on text or command output, then retrieve them with overview or detail actions.",
    promptSnippet: "Request user annotations with GitHub-style refs, then retrieve overview or detail without returning full source content.",
    promptGuidelines: [
      "Use annotate.request to ask the user for annotations on text or command output.",
      "Use annotate.overview before annotate.detail so only the needed annotation context enters the model context.",
      "Prefer command mode when the content should stay out of the model context."
    ],
    parameters: AnnotateParamsSchema,

    async execute(_toolCallId, params, signal) {
      switch (params.action) {
        case "request": {
          const request = parseRequestInput(params);
          if ("error" in request) {
            return createResult("request", request.error, { error: request.error });
          }

          return handleRequest(request, signal);
        }
        case "overview": {
          const overview = parseOverviewInput(params);
          if ("error" in overview) {
            return createResult("overview", overview.error, { error: overview.error });
          }

          return handleOverview(overview);
        }
        case "detail": {
          const detail = parseDetailInput(params);
          if ("error" in detail) {
            return createResult("detail", detail.error, { error: detail.error });
          }

          return handleDetail(detail);
        }
        default:
          return createResult("detail", `Unsupported annotate action: ${(params as { action: string }).action}`, {
            error: `unsupported action: ${(params as { action: string }).action}`
          });
      }
    },

    renderCall(args, theme) {
      return renderCall(args as AnnotateParams, theme);
    },

    renderResult(result, options, theme) {
      return renderResult(result.details as AnnotateToolDetails | undefined, result.content, options.expanded, theme);
    }
  });

  async function handleRequest(params: RequestTextInput | RequestCommandInput, signal: AbortSignal | undefined) {
    const source = await loadReviewSource(params, signal);
    const files = isUnifiedDiff(source.content) ? parseDiff(source.content) : [];
    const mode: ReviewMode = files.length > 0 ? "diff" : "text";
    const clientRequest =
      mode === "diff"
        ? ({ title: source.title, mode, content: source.content, files } satisfies DiffReviewClientRequest)
        : ({ title: source.title, mode, content: source.content, files: [] } satisfies TextReviewClientRequest);

    const clientResult = await reviewClient.requestReview(clientRequest, {
      onRerunCommand: source.kind === "command"
        ? async (command: string) => {
            const result = await pi.exec("sh", ["-lc", command], { signal });
            const content = combineCommandOutput(result.stdout, result.stderr, result.code);
            const newFiles = isUnifiedDiff(content) ? parseDiff(content) : [];
            return { content, files: newFiles };
          }
        : undefined
    });

    if (clientResult === null) {
      return createResult("request", "User cancelled the review.", { cancelled: true });
    }

    const review = createReview(source, mode, files, clientResult.annotations, clientResult.overallComment);
    reviews.push(review);

    return createResult("request", formatRequestResult(review), { review });
  }

  function handleOverview(params: OverviewInput) {
    const review = findReview(params.reviewId);
    if (!review) {
      return createResult("overview", `Review ${params.reviewId} was not found.`, {
        error: `review not found: ${params.reviewId}`
      });
    }

    return createResult("overview", formatOverview(review), { review });
  }

  function handleDetail(params: DetailInput) {
    const review = findReview(params.reviewId);
    if (!review) {
      return createResult("detail", `Review ${params.reviewId} was not found.`, {
        error: `review not found: ${params.reviewId}`
      });
    }

    const annotation = review.annotations.find((item) => item.id === params.annotationId);
    if (!annotation) {
      return createResult("detail", `Annotation ${params.annotationId} was not found in ${params.reviewId}.`, {
        error: `annotation not found: ${params.annotationId}`,
        review
      });
    }

    return createResult("detail", formatDetail(review, annotation), { review, annotation });
  }

  async function loadReviewSource(
    params: RequestTextInput | RequestCommandInput,
    signal: AbortSignal | undefined
  ): Promise<ReviewSource> {
    if ("command" in params) {
      const result = await pi.exec("sh", ["-lc", params.command], { signal });
      const content = combineCommandOutput(result.stdout, result.stderr, result.code);
      return {
        kind: "command",
        title: params.title ?? params.command,
        command: params.command,
        content,
        exitCode: result.code
      };
    }

    return {
      kind: "text",
      title: params.title ?? deriveTextTitle(params.content),
      content: params.content
    };
  }

  function createReview(source: ReviewSource, mode: ReviewMode, files: ReviewFile[], drafts: AnnotationDraft[], overallComment?: string): Review {
    const reviewId = `review-${nextReviewId++}`;
    const annotations =
      mode === "diff"
        ? drafts.map((draft, index) => createDiffAnnotation(draft, index, files))
        : drafts.map((draft, index) => createTextAnnotation(draft, index));

    return {
      id: reviewId,
      title: source.title,
      mode,
      source,
      files,
      annotations,
      overallComment,
      createdAt: new Date().toISOString()
    };
  }

  function createTextAnnotation(draft: AnnotationDraft, index: number): TextAnnotation {
    if (draft.kind !== "text") {
      throw new Error(`Expected text annotation draft, received ${draft.kind}`);
    }

    const normalized = normalizeRange(draft.lineStart, draft.lineEnd);
    return {
      kind: "text",
      id: `A${index + 1}`,
      lineSource: "text",
      lineStart: normalized.lineStart,
      lineEnd: normalized.lineEnd,
      comment: draft.comment,
      summary: truncateAnnotationSummary(draft.comment)
    };
  }

  function createDiffAnnotation(draft: AnnotationDraft, index: number, files: ReviewFile[]): DiffAnnotation {
    if (draft.kind !== "diff") {
      throw new Error(`Expected diff annotation draft, received ${draft.kind}`);
    }

    const filePath = draft.filePath || files[0]?.displayPath;
    if (!filePath) {
      throw new Error("Diff annotations require a file path");
    }

    const normalized = normalizeRange(draft.lineStart, draft.lineEnd);
    return {
      kind: "diff",
      id: `A${index + 1}`,
      filePath,
      lineSource: draft.lineSource,
      lineStart: normalized.lineStart,
      lineEnd: normalized.lineEnd,
      comment: draft.comment,
      summary: truncateAnnotationSummary(draft.comment)
    };
  }

  function findReview(reviewId: string): Review | undefined {
    return reviews.find((review) => review.id === reviewId);
  }

  function createResult(
    action: AnnotateToolDetails["action"],
    text: string,
    extra: Partial<Omit<AnnotateToolDetails, "action" | keyof AnnotateState>> = {}
  ) {
    return {
      content: [{ type: "text" as const, text }],
      details: {
        ...snapshotState(),
        action,
        ...extra
      } satisfies AnnotateToolDetails
    };
  }

  function snapshotState(): AnnotateState {
    return structuredClone({ reviews, nextReviewId });
  }
}

function parseRequestInput(params: AnnotateParams): RequestTextInput | RequestCommandInput | { error: string } {
  const hasContent = params.content !== undefined;
  const hasCommand = params.command !== undefined;

  if (hasContent === hasCommand) {
    return { error: "annotate.request requires exactly one of content or command." };
  }

  if (hasCommand) {
    return {
      action: "request",
      command: params.command!,
      title: params.title
    };
  }

  return {
    action: "request",
    content: params.content!,
    title: params.title
  };
}

function parseOverviewInput(params: AnnotateParams): OverviewInput | { error: string } {
  if (params.reviewId === undefined) {
    return { error: "annotate.overview requires reviewId." };
  }

  return {
    action: "overview",
    reviewId: params.reviewId
  };
}

function parseDetailInput(params: AnnotateParams): DetailInput | { error: string } {
  if (params.reviewId === undefined) {
    return { error: "annotate.detail requires reviewId." };
  }

  if (params.annotationId === undefined) {
    return { error: "annotate.detail requires annotationId." };
  }

  return {
    action: "detail",
    reviewId: params.reviewId,
    annotationId: params.annotationId
  };
}

function combineCommandOutput(stdout: string, stderr: string, exitCode: number | undefined): string {
  const parts: string[] = [];

  if (stdout.trim().length > 0) {
    parts.push(stdout.trimEnd());
  }

  if (stderr.trim().length > 0) {
    parts.push(`[stderr]\n${stderr.trimEnd()}`);
  }

  if (parts.length === 0) {
    const code = exitCode === undefined ? "unknown" : String(exitCode);
    return `(command exited with code ${code} and produced no output)`;
  }

  return parts.join("\n\n");
}

function deriveTextTitle(content: string): string {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim();
  if (!firstLine) {
    return "text review";
  }

  return firstLine.length <= 60 ? firstLine : `${firstLine.slice(0, 57).trimEnd()}...`;
}

function formatRequestResult(review: Review): string {
  const count = review.annotations.length;
  const parts: string[] = [];
  parts.push(`Review ${review.id} (${count} annotation${count === 1 ? "" : "s"}):`);

  if (review.overallComment) {
    parts.push("");
    parts.push("Overall comment:");
    parts.push(review.overallComment);
    parts.push("");
  }

  if (count === 0 && !review.overallComment) {
    parts.push("- No annotations submitted.");
  } else {
    for (const annotation of review.annotations) {
      parts.push(`- ${annotation.id}: ${formatAnnotationReference(annotation)} - \"${annotation.summary}\"`);
    }
  }

  return parts.join("\n");
}

function formatOverview(review: Review): string {
  const count = review.annotations.length;
  const header = `Review ${review.id} (${count} annotation${count === 1 ? "" : "s"}):`;

  if (count === 0) {
    return `${header}\n- No annotations submitted.`;
  }

  const entries = review.annotations.map((annotation) => {
    return `- ${annotation.id}: ${formatAnnotationReference(annotation)} - \"${annotation.summary}\"`;
  });

  return [header, ...entries].join("\n");
}

function formatDetail(review: Review, annotation: Annotation): string {
  const reference = formatAnnotationReference(annotation);
  const lines = [`Annotation ${annotation.id} in ${reference}`, ""];

  if (isDiffAnnotation(annotation)) {
    const file = review.files.find((item) => item.displayPath === annotation.filePath);
    if (file) {
      const context = extractDiffContext(file, annotation.lineSource, annotation.lineStart, annotation.lineEnd);
      if (context) {
        lines.push(`Context (${context.hunkHeader}):`);
        lines.push(...formatDiffContextLines(context.lines, annotation.lineSource));
      } else {
        lines.push("Context:");
        lines.push("  (No matching diff context found.)");
      }
    } else {
      lines.push("Context:");
      lines.push(`  (No parsed diff file found for ${annotation.filePath}.)`);
    }
  } else {
    lines.push(`Context (${formatTextReference(annotation.lineStart, annotation.lineEnd)}):`);
    lines.push(...formatTextContextLines(review.source.content, annotation.lineStart, annotation.lineEnd));
  }

  lines.push("");
  lines.push("Comment:");
  lines.push(...annotation.comment.split(/\r?\n/).map((line) => `  ${line}`));

  return lines.join("\n");
}

function formatTextContextLines(content: string, lineStart: number, lineEnd?: number, radius = 3): string[] {
  const rows = content.split(/\r?\n/);
  const range = normalizeRange(lineStart, lineEnd);
  const start = Math.max(1, range.lineStart - radius);
  const end = Math.min(rows.length, (range.lineEnd ?? range.lineStart) + radius);
  const width = String(end).length;
  const formatted: string[] = [];

  for (let index = start; index <= end; index += 1) {
    const annotated = index >= range.lineStart && index <= (range.lineEnd ?? range.lineStart);
    const prefix = annotated ? ">" : " ";
    const lineNumber = String(index).padStart(width, " ");
    formatted.push(`${prefix} ${lineNumber} | ${rows[index - 1] ?? ""}`);
  }

  return formatted;
}

function formatDiffContextLines(
  lines: Array<{ kind: "context" | "add" | "del"; text: string; oldLineNumber?: number; newLineNumber?: number; annotated: boolean }>,
  lineSource: "old" | "new"
): string[] {
  const lineNumbers = lines
    .map((line) => (lineSource === "new" ? line.newLineNumber : line.oldLineNumber))
    .filter((value): value is number => value !== undefined);
  const width = String(lineNumbers.length > 0 ? Math.max(...lineNumbers) : 0).length || 1;

  return lines.map((line) => {
    const prefix = line.annotated ? ">" : " ";
    const sign = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
    const rawLineNumber = lineSource === "new" ? line.newLineNumber : line.oldLineNumber;
    const lineNumber = rawLineNumber === undefined ? "".padStart(width, " ") : String(rawLineNumber).padStart(width, " ");
    return `${prefix}${sign} ${lineNumber} | ${line.text}`;
  });
}

function renderCall(args: AnnotateParams, theme: Theme) {
  switch (args.action) {
    case "request": {
      const isCommandRequest = typeof args.command === "string";
      const target = isCommandRequest ? args.command : previewText(args.content ?? "", 40);
      const mode = isCommandRequest ? "command" : "text";
      return new Text(
        theme.fg("toolTitle", theme.bold("annotate ")) +
          theme.fg("muted", `request ${mode}`) +
          " " +
          theme.fg("dim", JSON.stringify(target)),
        0,
        0
      );
    }
    case "overview":
      return new Text(
        theme.fg("toolTitle", theme.bold("annotate ")) +
          theme.fg("muted", `overview ${args.reviewId ?? "(missing reviewId)"}`),
        0,
        0
      );
    case "detail":
      return new Text(
        theme.fg("toolTitle", theme.bold("annotate ")) +
          theme.fg("muted", `detail ${args.reviewId ?? "(missing reviewId)"}`) +
          " " +
          theme.fg("accent", args.annotationId ?? "(missing annotationId)"),
        0,
        0
      );
  }
}

function renderResult(details: AnnotateToolDetails | undefined, content: Array<{ type: string; text?: string }>, expanded: boolean, theme: Theme) {
  if (!details || expanded) {
    const text = content[0]?.type === "text" ? content[0].text ?? "" : "";
    return new Text(text, 0, 0);
  }

  if (details.error) {
    return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
  }

  if (details.cancelled) {
    return new Text(theme.fg("dim", "Review cancelled"), 0, 0);
  }

  switch (details.action) {
    case "request": {
      const review = details.review;
      if (!review) {
        return new Text(theme.fg("dim", "No review stored"), 0, 0);
      }

      return new Text(
        theme.fg("success", "✓ ") +
          theme.fg("muted", `${review.id} with ${review.annotations.length} annotation${review.annotations.length === 1 ? "" : "s"}`),
        0,
        0
      );
    }

    case "overview": {
      const review = details.review;
      if (!review) {
        return new Text(theme.fg("dim", "No review found"), 0, 0);
      }

      const preview = review.annotations
        .slice(0, 3)
        .map((annotation) => `${annotation.id} ${formatAnnotationReference(annotation)}`)
        .join("\n");
      const suffix = review.annotations.length > 3 ? `\n${theme.fg("dim", `... ${review.annotations.length - 3} more`)}` : "";
      return new Text(`${theme.fg("muted", `${review.id} overview`)}${preview ? `\n${preview}` : ""}${suffix}`, 0, 0);
    }

    case "detail": {
      const annotation = details.annotation;
      if (!annotation) {
        return new Text(theme.fg("dim", "No annotation found"), 0, 0);
      }

      return new Text(
        theme.fg("muted", `${annotation.id} ${formatAnnotationReference(annotation)}`) +
          "\n" +
          theme.fg("dim", previewText(annotation.comment, 80)),
        0,
        0
      );
    }
  }
}

function previewText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function createReviewClient(): ReviewClient {
  if (process.env.PIANNOTATOR_REVIEW_CLIENT === "stub") {
    return new StubReviewClient();
  }

  return new GlimpseReviewClient();
}
