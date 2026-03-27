import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { extractDiffContext, isUnifiedDiff, parseDiff, textToDiff } from "./diff-parser.js";
import type { ReviewClient } from "./review-client.js";
import { GlimpseReviewClient } from "./review-client-glimpse.js";
import { StubReviewClient } from "./review-client-stub.js";
import {
  formatAnnotationReference,
  normalizeRange,
  truncateAnnotationSummary,
  type AnnotateState,
  type AnnotateToolDetails,
  type Annotation,
  type AnnotationDraft,
  type Review,
  type ReviewBridgeVersion,
  type ReviewClientRequest,
  type ReviewFile,
  type ReviewSource,
  type ReviewSourceCommand,
  type ReviewVersion
} from "./types.js";

const AnnotateParamsSchema = Type.Object(
  {
    action: StringEnum(["request", "detail"] as const, {
      description: "Tool action: request starts a review, detail returns one annotation."
    }),
    command: Type.Optional(
      Type.String({ description: "Shell command whose output should be reviewed. Use with action=request." })
    ),
    title: Type.Optional(Type.String({ description: "Short review title. Use with action=request." })),
    reviewId: Type.Optional(
      Type.String({ description: "Review ID returned by request. Use with action=detail." })
    ),
    annotationIds: Type.Optional(
      Type.Array(
        Type.String({ description: "Annotation ID (e.g. \"A1\") or range (e.g. \"A1..A3\")" }),
        { description: "Annotation IDs to retrieve. Supports ranges. Use with action=detail." }
      )
    )
  },
  { additionalProperties: false }
);

type AnnotateParams = Static<typeof AnnotateParamsSchema>;

type RequestInput = {
  action: "request";
  command: string;
  title?: string;
};

type DetailInput = {
  action: "detail";
  reviewId: string;
  annotationIds: string[];
};

export default function (pi: ExtensionAPI) {
  let reviews: Review[] = [];
  let nextReviewId = 1;
  const reviewClient: ReviewClient = createReviewClient();

  const reconstructState = (ctx: ExtensionContext) => {
    reviews = [];
    nextReviewId = 1;

    for (const entry of ctx.sessionManager.getBranch()) {
      // Tool results from the annotate tool
      if (entry.type === "message") {
        const message = entry.message;
        if (message.role === "toolResult" && message.toolName === "annotate") {
          const details = message.details as AnnotateToolDetails | undefined;
          if (details?.reviews !== undefined) {
            reviews = details.reviews;
          }
          if (details?.nextReviewId !== undefined) {
            nextReviewId = details.nextReviewId;
          }
        }
        continue;
      }

      // Custom messages from the /annotate slash command
      if (entry.type === "custom_message" && entry.customType === "annotate") {
        const details = entry.details as AnnotateState | undefined;
        if (details?.reviews !== undefined) {
          reviews = details.reviews;
        }
        if (details?.nextReviewId !== undefined) {
          nextReviewId = details.nextReviewId;
        }
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
    description: "Request user annotations on command output, then retrieve annotation details.",
    promptSnippet: "Request user annotations with GitHub-style refs, then retrieve detail without returning full source content.",
    promptGuidelines: [
      "Use annotate.request to ask the user for annotations on command output.",
      "The request result includes an annotation overview. Use annotate.detail to get full context for a specific annotation.",
      "Use annotate.detail with annotationIds like [\"A1\"] or ranges like [\"A1..A3\"] to get context for annotations.",
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

  // /annotate slash command
  pi.registerCommand("annotate", {
    description: "Open annotation review UI for a command or the last assistant message",
    handler: async (args, ctx) => {
      let source: ReviewSourceCommand;

      if (args.trim()) {
        const execResult = await pi.exec("sh", ["-lc", args.trim()]);
        const content = combineCommandOutput(execResult.stdout, execResult.stderr, execResult.code);
        source = {
          kind: "command",
          title: args.trim(),
          command: args.trim(),
          content,
          exitCode: execResult.code
        };
      } else {
        const assistantText = getLastAssistantText(ctx);
        if (!assistantText) {
          ctx.ui.notify("No assistant message found to annotate", "warning");
          return;
        }
        const diffContent = textToDiff(assistantText, "assistant-message");
        source = {
          kind: "command",
          title: "assistant message",
          command: "",
          content: diffContent,
          exitCode: 0
        };
      }

      const result = await executeReview(source);

      if (result.cancelled) {
        ctx.ui.notify("Review cancelled", "info");
        return;
      }

      pi.sendMessage({
        customType: "annotate",
        content: formatRequestResult(result.review),
        display: true,
        details: snapshotState()
      }, {
        triggerTurn: true
      });
    }
  });

  // Custom TUI renderer for /annotate command results
  pi.registerMessageRenderer("annotate", (message, options, theme) => {
    if (options.expanded) {
      const text = typeof message.content === "string" ? message.content : "";
      return new Text(text, 0, 0);
    }

    const details = message.details as AnnotateState | undefined;
    const lastReview = details?.reviews?.[details.reviews.length - 1];
    if (!lastReview) {
      return new Text(theme.fg("dim", "Review (no data)"), 0, 0);
    }

    return new Text(
      theme.fg("success", "~ ") +
        theme.fg("toolTitle", theme.bold("annotate ")) +
        theme.fg("muted", `${lastReview.id} with ${lastReview.annotations.length} annotation${lastReview.annotations.length === 1 ? "" : "s"}`),
      0,
      0
    );
  });

  async function executeReview(
    source: ReviewSourceCommand,
    signal?: AbortSignal
  ): Promise<{ review: Review; cancelled: false } | { cancelled: true }> {
    const files = isUnifiedDiff(source.content) ? parseDiff(source.content) : [];
    const clientRequest: ReviewClientRequest = {
      title: source.title,
      content: source.content,
      files,
      command: source.command
    };

    const clientResult = await reviewClient.requestReview(clientRequest, {
      onRerunCommand: async (command: string) => {
        const result = await pi.exec("sh", ["-lc", command], { signal });
        const content = combineCommandOutput(result.stdout, result.stderr, result.code);
        const newFiles = isUnifiedDiff(content) ? parseDiff(content) : [];
        return { content, files: newFiles };
      }
    });

    if (clientResult === null) {
      return { cancelled: true };
    }

    const review = createReview(source, files, clientResult.versions, clientResult.overallComment);
    reviews.push(review);
    return { review, cancelled: false };
  }

  async function handleRequest(params: RequestInput, signal: AbortSignal | undefined) {
    const source = await loadReviewSource(params, signal);
    const result = await executeReview(source, signal);

    if (result.cancelled) {
      return createResult("request", "User cancelled the review.", { cancelled: true });
    }

    return createResult("request", formatRequestResult(result.review), { review: result.review });
  }

  function handleDetail(params: DetailInput) {
    const review = findReview(params.reviewId);
    if (!review) {
      return createResult("detail", `Review ${params.reviewId} was not found.`, {
        error: `review not found: ${params.reviewId}`
      });
    }

    const expandedIds = expandAnnotationIds(params.annotationIds);
    const parts: string[] = [];
    let lastAnnotation: Annotation | undefined;

    for (const id of expandedIds) {
      const annotation = review.annotations.find((item) => item.id === id);
      if (!annotation) {
        parts.push(`Annotation ${id} was not found in ${params.reviewId}.`);
      } else {
        parts.push(formatDetail(review, annotation));
        lastAnnotation = annotation;
      }
    }

    return createResult("detail", parts.join("\n\n---\n\n"), { review, annotation: lastAnnotation });
  }

  async function loadReviewSource(
    params: RequestInput,
    signal: AbortSignal | undefined
  ): Promise<ReviewSourceCommand> {
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

  function createReview(
    source: ReviewSource,
    initialFiles: ReviewFile[],
    versions: ReviewBridgeVersion[],
    overallComment?: string
  ): Review {
    const reviewId = `review-${nextReviewId++}`;

    // Only keep versions that have annotations
    const keptVersions = versions.filter((v) => v.annotations.length > 0);

    const allDrafts: AnnotationDraft[] = [];
    const reviewVersions: ReviewVersion[] = [];

    for (let vi = 0; vi < keptVersions.length; vi++) {
      const version = keptVersions[vi];
      const originalIndex = versions.indexOf(version);
      const files = version.files ?? (originalIndex === 0 ? initialFiles : []);
      reviewVersions.push({ command: version.command, files });
      for (const draft of version.annotations) {
        allDrafts.push({ ...draft, versionIndex: vi });
      }
    }

    const annotations = allDrafts.map((draft, index) => ({
      ...draft,
      id: `A${index + 1}`,
      summary: truncateAnnotationSummary(draft.comment)
    }));

    return {
      id: reviewId,
      title: source.title,
      source,
      files: initialFiles,
      annotations,
      versions: reviewVersions,
      overallComment,
      createdAt: new Date().toISOString()
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

function parseRequestInput(params: AnnotateParams): RequestInput | { error: string } {
  if (params.command === undefined) {
    return { error: "annotate.request requires a command." };
  }

  return {
    action: "request",
    command: params.command,
    title: params.title
  };
}

function parseDetailInput(params: AnnotateParams): DetailInput | { error: string } {
  if (params.reviewId === undefined) {
    return { error: "annotate.detail requires reviewId." };
  }

  if (params.annotationIds === undefined || params.annotationIds.length === 0) {
    return { error: "annotate.detail requires annotationIds." };
  }

  return {
    action: "detail",
    reviewId: params.reviewId,
    annotationIds: params.annotationIds
  };
}

function expandAnnotationIds(input: string[]): string[] {
  const ids: string[] = [];
  for (const item of input) {
    const rangeMatch = /^A(\d+)\.\.A(\d+)$/.exec(item);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
        ids.push(`A${i}`);
      }
    } else {
      ids.push(item);
    }
  }
  return ids;
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

function formatRequestResult(review: Review): string {
  const count = review.annotations.length;
  const versions = review.versions ?? [];
  const parts: string[] = [];

  if (versions.length > 1) {
    parts.push(`Review ${review.id} (${versions.length} versions, ${count} annotation${count === 1 ? "" : "s"}):`);
  } else {
    parts.push(`Review ${review.id} (${count} annotation${count === 1 ? "" : "s"}):`);
  }

  for (let vi = 0; vi < versions.length; vi++) {
    const version = versions[vi];
    const versionAnnotations = review.annotations.filter((a) => a.versionIndex === vi);
    parts.push("");
    parts.push(`Version ${vi + 1}${version.command ? ` (${version.command})` : ""}:`);
    if (versionAnnotations.length === 0) {
      parts.push("- No annotations");
    } else {
      for (const annotation of versionAnnotations) {
        parts.push(`- ${annotation.id}: ${formatAnnotationReference(annotation)} - \"${annotation.summary}\"`);
      }
    }
  }

  if (review.overallComment) {
    parts.push("");
    parts.push("Overall comment:");
    parts.push(review.overallComment);
  }

  return parts.join("\n");
}

function formatDetail(review: Review, annotation: Annotation): string {
  const reference = formatAnnotationReference(annotation);
  const lines = [`Annotation ${annotation.id} in ${reference}`, ""];

  if (annotation.filePath) {
    // Use version-specific files if available, else fall back to review.files
    const versionFiles = annotation.versionIndex !== undefined && review.versions?.[annotation.versionIndex]?.files.length
      ? review.versions[annotation.versionIndex].files
      : review.files;
    const file = versionFiles.find((item) => item.displayPath === annotation.filePath);
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
  }

  lines.push("");
  lines.push("Comment:");
  lines.push(...annotation.comment.split(/\r?\n/).map((line) => `  ${line}`));

  return lines.join("\n");
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
      return new Text(
        theme.fg("toolTitle", theme.bold("annotate ")) +
          theme.fg("muted", "request") +
          " " +
          theme.fg("dim", JSON.stringify(args.command ?? "")),
        0,
        0
      );
    }
    case "detail": {
      const ids = args.annotationIds ?? [];
      const idLabel = ids.length === 0 ? "(missing annotationIds)" : ids.length === 1 ? ids[0] : `${ids.length} annotations`;
      return new Text(
        theme.fg("toolTitle", theme.bold("annotate ")) +
          theme.fg("muted", `detail ${args.reviewId ?? "(missing reviewId)"}`) +
          " " +
          theme.fg("accent", idLabel),
        0,
        0
      );
    }
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
        theme.fg("success", "~ ") +
          theme.fg("muted", `${review.id} with ${review.annotations.length} annotation${review.annotations.length === 1 ? "" : "s"}`),
        0,
        0
      );
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

function getLastAssistantText(ctx: ExtensionContext): string | null {
  const entries = ctx.sessionManager.getBranch();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "message") {
      continue;
    }

    const message = entry.message;
    if (message.role !== "assistant") {
      continue;
    }

    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => ("text" in part ? part.text : ""))
      .join("\n");
    return text.trim() || null;
  }

  return null;
}

function createReviewClient(): ReviewClient {
  if (process.env.PIANNOTATOR_REVIEW_CLIENT === "stub") {
    return new StubReviewClient();
  }

  return new GlimpseReviewClient();
}
