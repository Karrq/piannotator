import { existsSync } from "node:fs";
import path from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import { BorderedLoader, type ExtensionAPI, type ExtensionContext, type ExtensionCommandContext, type SessionEntry, type Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { createPiannotatorAPI } from "./api.js";
import { extractDiffContext, isUnifiedDiff, parseDiff, textToDiff } from "./diff-parser.js";
import type { ReviewClient } from "./review-client.js";
import { CmuxReviewClient } from "./review-client-cmux.js";
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
  type ReviewBridgeExtensionMessage,
  type ReviewBridgeMessage,
  type ReviewBridgeVersion,
  type ReviewClientRequest,
  type ReviewFile,
  type ReviewSource,
  type ReviewSourceCommand,
  type ReviewVersion,
  type TimelineItem
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
  command?: string;
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
  let lastReviewRef: string | undefined;
  /** VCS refs captured at the end of each turn, ordered chronologically. */
  let turnRefs: string[] = [];
  const reviewClient: ReviewClient = createReviewClient(pi);
  const api = createPiannotatorAPI();

  pi.events.on("piannotator:get_api", () => {
    pi.events.emit("piannotator", api);
  });

  const reconstructState = (ctx: ExtensionContext) => {
    reviews = [];
    nextReviewId = 1;
    lastReviewRef = undefined;
    turnRefs = [];

    for (const entry of ctx.sessionManager.getBranch() as SessionEntry[]) {
      if (entry.type === "custom" && entry.customType === "annotate-ref") {
        const ref = entry.data && typeof entry.data === "object" ? (entry.data as { ref?: unknown }).ref : undefined;
        if (typeof ref === "string" && ref.trim().length > 0) {
          lastReviewRef = ref;
        }
        continue;
      }

      if (entry.type === "custom" && entry.customType === "annotate-turn-ref") {
        const data = entry.data as { ref?: unknown } | undefined;
        const ref = data && typeof data === "object" ? data.ref : undefined;
        if (typeof ref === "string" && ref.trim().length > 0) {
          turnRefs.push(ref);
        }
        continue;
      }

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
          if (details?.lastReviewRef !== undefined) {
            lastReviewRef = details.lastReviewRef;
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
        if (details?.lastReviewRef !== undefined) {
          lastReviewRef = details.lastReviewRef;
        }
      }
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    reconstructState(ctx);
    await ensureBaselineRef();
    pi.events.emit("piannotator", api);
  });
  pi.on("session_switch", async (_event, ctx) => {
    reconstructState(ctx);
    await ensureBaselineRef();
  });
  pi.on("session_fork", async (_event, ctx) => {
    reconstructState(ctx);
    await ensureBaselineRef();
  });
  pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

  pi.on("turn_end", async () => {
    const ref = await getCurrentReviewRef();
    if (ref !== undefined) {
      turnRefs.push(ref);
      pi.appendEntry("annotate-turn-ref", { ref });
    }
  });

  pi.registerTool({
    name: "annotate",
    label: "Annotate",
    description: "Request user annotations on command output or recent changes, then retrieve annotation details.",
    promptSnippet: "Request user annotations with GitHub-style refs, then retrieve detail without returning full source content.",
    promptGuidelines: [
      "Use annotate.request to ask the user for annotations on command output.",
      "Use annotate.request without a command to review all changes since the last review.",
      "The request result includes an annotation overview. Use annotate.detail to get full context for a specific annotation.",
      "Use annotate.detail with annotationIds like [\"A1\"] or ranges like [\"A1..A3\"] to get context for annotations.",
      "Prefer command mode when the content should stay out of the model context."
    ],
    parameters: AnnotateParamsSchema,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      switch (params.action) {
        case "request": {
          const request = parseRequestInput(params);
          if ("error" in request) {
            return createResult("request", request.error, { error: request.error });
          }

          return handleRequest(request, signal, ctx);
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
    description: "Open annotation review UI for a command or the latest turn review surface",
    handler: async (args, ctx) => {
      let source: ReviewSourceCommand;

      if (args.trim()) {
        const execResult = await pi.exec("sh", ["-lc", wrapWithFullContext(args.trim())]);
        const content = combineCommandOutput(execResult.stdout, execResult.stderr, execResult.code);
        source = {
          kind: "command",
          title: args.trim(),
          command: args.trim(),
          content,
          exitCode: execResult.code
        };
      } else {
        const defaultSource = await buildDefaultReviewSource(ctx);
        if (!defaultSource) {
          ctx.ui.notify("No assistant message or code changes found to annotate", "warning");
          return;
        }
        source = defaultSource;
      }

      const result = await executeCommandReview(ctx, source);

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

  async function executeCommandReview(
    ctx: ExtensionCommandContext,
    source: ReviewSourceCommand
  ): Promise<{ review: Review; cancelled: false } | { cancelled: true }> {
    if (!ctx.hasUI) {
      return executeReview(source, undefined, ctx);
    }

    const abortController = new AbortController();
    const result = await ctx.ui.custom<
      | { review: Review; cancelled: false }
      | { cancelled: true }
      | { error: unknown }
    >((tui, theme, _keybindings, done) => {
      const loader = new BorderedLoader(tui, theme, "Review in progress...");
      let finished = false;

      const finish = (value: { review: Review; cancelled: false } | { cancelled: true } | { error: unknown }) => {
        if (finished) {
          return;
        }

        finished = true;
        loader.dispose();
        done(value);
      };

      void executeReview(source, abortController.signal, ctx).then(
        (value) => finish(value),
        (error) => finish({ error })
      );

      loader.onAbort = () => {
        abortController.abort();
        finish({ cancelled: true });
      };

      return loader;
    });

    if ("error" in result) {
      throw result.error;
    }

    return result;
  }

  async function executeReview(
    source: ReviewSourceCommand,
    signal?: AbortSignal,
    ctx?: ExtensionContext
  ): Promise<{ review: Review; cancelled: false } | { cancelled: true }> {
    const onMessage = ctx
      ? (msg: ReviewBridgeMessage) => handleBridgeMessage(msg, ctx, signal)
      : (_msg: ReviewBridgeMessage) => Promise.resolve(null);

    const clientResult = await api.requestReview({
      title: source.title,
      content: source.content,
      client: reviewClient,
      onMessage,
      signal,
      onRerunCommand: async (command: string) => {
        const rerunResult = await pi.exec("sh", ["-lc", wrapWithFullContext(command)], { signal });
        const content = combineCommandOutput(rerunResult.stdout, rerunResult.stderr, rerunResult.code);
        const newFiles = isUnifiedDiff(content) ? parseDiff(content) : [];
        return { content, files: newFiles };
      }
    });

    if (clientResult === null) {
      return { cancelled: true };
    }

    const review = createReview(source, clientResult.versions, clientResult.overallComment);
    reviews.push(review);
    lastReviewRef = await getCurrentReviewRef();
    return { review, cancelled: false };
  }

  async function handleRequest(params: RequestInput, signal: AbortSignal | undefined, ctx?: ExtensionContext) {
    let source: ReviewSourceCommand;
    if (params.command) {
      source = await loadReviewSource({ ...params, command: params.command }, signal);
    } else {
      const defaultSource = ctx ? await buildDefaultReviewSource(ctx) : undefined;
      if (!defaultSource) {
        return createResult("request", "No assistant messages or code changes found to review.", {
          error: "no changes found"
        });
      }
      source = defaultSource;
    }

    const result = await executeReview(source, signal, ctx);

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
    params: { command: string; title?: string },
    signal: AbortSignal | undefined
  ): Promise<ReviewSourceCommand> {
    const result = await pi.exec("sh", ["-lc", wrapWithFullContext(params.command)], { signal });
    const content = combineCommandOutput(result.stdout, result.stderr, result.code);
    return {
      kind: "command",
      title: params.title ?? params.command,
      command: params.command,
      content,
      exitCode: result.code
    };
  }

  async function ensureBaselineRef() {
    if (lastReviewRef) {
      return;
    }

    const ref = await getCurrentReviewRef();
    if (!ref) {
      return;
    }

    lastReviewRef = ref;
    pi.appendEntry("annotate-ref", { ref });
  }

  async function getCurrentReviewRef(): Promise<string | undefined> {
    const vcs = detectVcs(process.cwd());

    if (vcs === "jj") {
      const result = await pi.exec("jj", ["log", "-r", "@", "-T", "commit_id", "--no-graph"]);
      const ref = result.stdout.trim();
      return result.code === 0 && ref ? ref : undefined;
    }

    if (vcs === "git") {
      const result = await pi.exec("git", ["rev-parse", "HEAD"]);
      const ref = result.stdout.trim();
      return result.code === 0 && ref ? ref : undefined;
    }

    return undefined;
  }

  async function getChangesSinceLastReview(): Promise<{ diff: string; command: string } | undefined> {
    if (!lastReviewRef) {
      return undefined;
    }

    const vcs = detectVcs(process.cwd());
    if (!vcs) {
      return undefined;
    }

    const command = vcs === "jj"
      ? `jj diff --from ${shellQuote(lastReviewRef)} --git`
      : `git diff ${shellQuote(lastReviewRef)}`;
    const result = await pi.exec("sh", ["-lc", wrapWithFullContext(command)]);
    const diff = result.stdout.trim();
    return result.code === 0 && diff ? { diff, command } : undefined;
  }

  function createReview(
    source: ReviewSource,
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
      reviewVersions.push({ command: version.command, files: version.files ?? [] });
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
    return structuredClone({ reviews, nextReviewId, lastReviewRef });
  }

  async function buildDefaultReviewSource(ctx: ExtensionContext): Promise<ReviewSourceCommand | undefined> {
    const entries = ctx.sessionManager.getBranch() as SessionEntry[];
    const lastReviewIndex = findLastReviewEntryIndex(entries);
    const assistantDiff = getAssistantMessagesSinceIndex(entries, lastReviewIndex);
    const codeResult = await getChangesSinceLastReview();

    if (!assistantDiff && !codeResult) {
      return undefined;
    }

    const contentParts = [codeResult?.diff, assistantDiff].filter((part): part is string => Boolean(part));
    const command = codeResult?.command ?? "";
    return {
      kind: "command",
      title: command || "turn review",
      command,
      content: contentParts.join("\n"),
      exitCode: 0
    };
  }

  /** Internal timeline item with entry indices for mapping back to session data. */
  type InternalTimelineItem =
    | { kind: "turn"; timestamp: string; preview: string; fullText: string; ref?: string; entryIndex: number }
    | { kind: "review"; reviewId: string; timestamp: string; ref?: string; title?: string; annotationCount?: number; annotationSummaries?: string[]; overallComment?: string; entryIndex: number };

  /** Cached internal timeline from the last list-timeline request. */
  let cachedTimeline: InternalTimelineItem[] | null = null;

  function buildInternalTimeline(ctx: ExtensionContext): InternalTimelineItem[] {
    const entries = ctx.sessionManager.getBranch() as SessionEntry[];
    const items: InternalTimelineItem[] = [];
    const reviewTimestamps = new Map<string, string>();
    const emittedReviews = new Set<string>();

    for (const review of reviews) {
      reviewTimestamps.set(review.id, review.createdAt);
    }

    // Track the current turn so we can associate turn-ref entries with it
    let currentTurnIndex = -1;

    for (let ei = 0; ei < entries.length; ei++) {
      const entry = entries[ei];

      // User messages mark turns
      if (entry.type === "message" && entry.message.role === "user") {
        const content = entry.message.content;
        const fullText = typeof content === "string"
          ? content.trim()
          : (content as Array<{ type: string; text?: string }>)
              .filter((part) => part.type === "text")
              .map((part) => part.text ?? "")
              .join(" ")
              .trim();

        const preview = fullText.length > 100 ? fullText.slice(0, 97) + "..." : fullText;

        currentTurnIndex = items.length;
        items.push({
          kind: "turn",
          timestamp: entry.timestamp,
          preview,
          fullText,
          ref: undefined,
          entryIndex: ei
        });
        continue;
      }

      // Turn ref entries - associate with the most recent turn
      if (entry.type === "custom" && entry.customType === "annotate-turn-ref") {
        const data = entry.data as { ref?: unknown } | undefined;
        const ref = data && typeof data === "object" ? data.ref : undefined;
        if (typeof ref === "string" && ref.trim().length > 0 && currentTurnIndex >= 0) {
          const turn = items[currentTurnIndex];
          if (turn.kind === "turn") {
            turn.ref = ref;
          }
        }
        continue;
      }

      // Review completion entries
      const reviewId = extractReviewIdFromEntry(entry);
      if (reviewId && !emittedReviews.has(reviewId)) {
        emittedReviews.add(reviewId);
        // Extract the VCS ref at review time from the stored state
        const reviewRef = extractReviewRef(entry);
        const review = reviews.find((r) => r.id === reviewId);
        items.push({
          kind: "review",
          reviewId,
          timestamp: reviewTimestamps.get(reviewId) ?? entry.timestamp,
          ref: reviewRef,
          title: review?.title,
          annotationCount: review?.annotations.length,
          annotationSummaries: review?.annotations.slice(0, 5).map((a) =>
            `${formatAnnotationReference(a)} - "${truncateAnnotationSummary(a.comment)}"`
          ),
          overallComment: review?.overallComment,
          entryIndex: ei
        });
      }
    }

    return items;
  }

  /** Convert internal timeline to the bridge format sent to the UI. */
  function toTimelineItems(internal: InternalTimelineItem[]): TimelineItem[] {
    return internal.map((item): TimelineItem => {
      if (item.kind === "turn") {
        return { kind: "turn", timestamp: item.timestamp, preview: item.preview, fullText: item.fullText, ref: item.ref };
      }
      return {
        kind: "review",
        reviewId: item.reviewId,
        timestamp: item.timestamp,
        ref: item.ref,
        title: item.title,
        annotationCount: item.annotationCount,
        annotationSummaries: item.annotationSummaries,
        overallComment: item.overallComment
      };
    });
  }

  async function handleBridgeMessage(
    msg: ReviewBridgeMessage,
    ctx: ExtensionContext,
    signal?: AbortSignal
  ): Promise<ReviewBridgeExtensionMessage | null> {
    switch (msg.type) {
      case "rerun": {
        try {
          const result = await pi.exec("sh", ["-lc", wrapWithFullContext(msg.command)], { signal });
          const content = combineCommandOutput(result.stdout, result.stderr, result.code);
          const files = isUnifiedDiff(content) ? parseDiff(content) : [];
          return { type: "update", content, files };
        } catch (err) {
          return { type: "rerun-error", error: String(err) };
        }
      }
      case "list-timeline": {
        cachedTimeline = buildInternalTimeline(ctx);
        return {
          type: "timeline",
          items: toTimelineItems(cachedTimeline),
          vcsType: detectVcs(process.cwd()),
          baselineRef: lastReviewRef
        };
      }
      case "turn-messages": {
        try {
          const internal = cachedTimeline ?? buildInternalTimeline(ctx);
          cachedTimeline = internal;
          const entries = ctx.sessionManager.getBranch() as SessionEntry[];

          const firstItem = internal[msg.fromIndex];
          const lastItem = internal[msg.toIndex];
          if (!firstItem || !lastItem) {
            return { type: "turn-messages-result", content: "" };
          }

          const fromEntryIndex = firstItem.entryIndex;
          let toEntryIndex = lastItem.entryIndex;
          for (let i = toEntryIndex + 1; i < entries.length; i++) {
            const e = entries[i];
            if (e.type === "message" && e.message.role === "user") break;
            toEntryIndex = i;
          }

          const assistantDiff = getAssistantMessagesInRange(entries, fromEntryIndex, toEntryIndex);
          return { type: "turn-messages-result", content: assistantDiff ?? "" };
        } catch (err) {
          return { type: "rerun-error", error: String(err) };
        }
      }
      default:
        return null;
    }
  }

  /**
   * VCS diff between two refs. When toRef is undefined, diffs against the
   * working copy (current state). This matters for jj where the latest
   * commit_id may have been rewritten - omitting --to diffs to the live
   * working copy instead of a potentially stale commit.
   */
  async function getVcsDiff(fromRef: string, toRef?: string): Promise<{ diff: string; command: string } | undefined> {
    const vcs = detectVcs(process.cwd());
    if (!vcs) {
      return undefined;
    }

    let command: string;
    if (vcs === "jj") {
      command = toRef
        ? `jj diff --from ${shellQuote(fromRef)} --to ${shellQuote(toRef)} --git`
        : `jj diff --from ${shellQuote(fromRef)} --git`;
    } else {
      command = toRef
        ? `git diff ${shellQuote(fromRef)} ${shellQuote(toRef)}`
        : `git diff ${shellQuote(fromRef)}`;
    }

    const result = await pi.exec("sh", ["-lc", wrapWithFullContext(command)]);
    const diff = result.stdout.trim();
    return result.code === 0 && diff ? { diff, command } : undefined;
  }
}

function parseRequestInput(params: AnnotateParams): RequestInput | { error: string } {
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
    const versionFiles = annotation.versionIndex !== undefined ? review.versions[annotation.versionIndex]?.files ?? [] : [];
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

/**
 * Find the index of the last entry in the branch that completed a review.
 * Returns -1 if no review has been completed.
 */
function findLastReviewEntryIndex(entries: SessionEntry[]): number {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (extractReviewIdFromEntry(entries[i]) !== undefined) {
      return i;
    }
  }
  return -1;
}

/**
 * Extract a review ID from an entry if it represents a completed review.
 * Returns the most recently added review ID, or undefined.
 */
function extractReviewIdFromEntry(entry: SessionEntry): string | undefined {
  if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "annotate") {
    const details = entry.message.details as AnnotateToolDetails | undefined;
    if (details?.review?.id) {
      return details.review.id;
    }
  }
  if (entry.type === "custom_message" && entry.customType === "annotate") {
    const details = entry.details as AnnotateState | undefined;
    if (details?.reviews && details.reviews.length > 0) {
      return details.reviews[details.reviews.length - 1].id;
    }
  }
  return undefined;
}

/**
 * Extract the VCS ref stored at review time from an entry's state snapshot.
 */
function extractReviewRef(entry: SessionEntry): string | undefined {
  if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "annotate") {
    const details = entry.message.details as AnnotateToolDetails | undefined;
    return details?.lastReviewRef;
  }
  if (entry.type === "custom_message" && entry.customType === "annotate") {
    const details = entry.details as AnnotateState | undefined;
    return details?.lastReviewRef;
  }
  return undefined;
}

/**
 * Collect assistant messages from entries starting after `fromIndex` to end of array.
 * If fromIndex is -1, collects from the start.
 */
function getAssistantMessagesSinceIndex(entries: SessionEntry[], fromIndex: number): string | null {
  const start = fromIndex === -1 ? 0 : fromIndex + 1;
  return collectAssistantMessages(entries, start, entries.length);
}

/**
 * Collect assistant messages in a specific entry range (inclusive on both ends).
 */
function getAssistantMessagesInRange(entries: SessionEntry[], from: number, to: number): string | null {
  return collectAssistantMessages(entries, from, to + 1);
}

function collectAssistantMessages(entries: SessionEntry[], startIndex: number, endIndex: number): string | null {
  const sections: string[] = [];
  let assistantIndex = 1;

  for (let i = startIndex; i < endIndex; i++) {
    const entry = entries[i];
    if (entry.type !== "message" || entry.message.role !== "assistant") {
      continue;
    }

    const text = entry.message.content
      .filter((part) => part.type === "text")
      .map((part) => ("text" in part ? part.text : ""))
      .join("\n\n")
      .trim();

    if (!text) {
      continue;
    }

    sections.push(`## ${formatAssistantMessageHeading(entry.timestamp, assistantIndex)}\n\n${text}`);
    assistantIndex += 1;
  }

  if (sections.length === 0) {
    return null;
  }

  return textToDiff(sections.join("\n\n"), "assistant-messages.md");
}




function formatAssistantMessageHeading(timestamp: unknown, assistantIndex: number): string {
  if (typeof timestamp === "string") {
    const date = new Date(timestamp);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return `Assistant message ${assistantIndex}`;
}

function detectVcs(cwd: string): "jj" | "git" | null {
  if (existsSync(path.join(cwd, ".jj"))) {
    return "jj";
  }

  if (existsSync(path.join(cwd, ".git"))) {
    return "git";
  }

  return null;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Wraps a shell command so git/jj produce full-context diffs (entire file).
 * The full context lets us extract old/new file contents for expandable
 * collapsed regions in the diff UI.
 */
function wrapWithFullContext(command: string): string {
  const preamble = [
    `git(){ command git -c diff.context=999999999 "$@"; }`,
    `jj(){ command jj --config 'diff.git.context=999999999' "$@"; }`,
  ].join("; ");
  return `${preamble}; ${command}`;
}

function createReviewClient(pi: ExtensionAPI): ReviewClient {
  const explicitClient = process.env.PIANNOTATOR_REVIEW_CLIENT;

  if (explicitClient === "stub") {
    return new StubReviewClient();
  }

  if (explicitClient === "glimpse") {
    return new GlimpseReviewClient();
  }

  if (isCmux()) {
    return new CmuxReviewClient(pi);
  }

  return new GlimpseReviewClient();
}

function isCmux(): boolean {
  return Boolean(process.env.CMUX_WORKSPACE_ID && process.env.CMUX_SURFACE_ID);
}
