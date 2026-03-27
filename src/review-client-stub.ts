import { findFirstChangedLine } from "./diff-parser.js";
import type { ReviewClient, ReviewClientOptions } from "./review-client.js";
import type {
  DiffAnnotationDraft,
  DiffReviewClientRequest,
  ReviewClientRequest,
  ReviewClientResult,
  TextAnnotationDraft,
  TextReviewClientRequest
} from "./types.js";

const STUB_CANCEL_TOKEN = "[[stub-cancel]]";

export class StubReviewClient implements ReviewClient {
  async requestReview(input: ReviewClientRequest, _options?: ReviewClientOptions): Promise<ReviewClientResult | null> {
    if (input.content.includes(STUB_CANCEL_TOKEN)) {
      return null;
    }

    if (input.mode === "diff") {
      return this.buildDiffResult(input);
    }

    return this.buildTextResult(input);
  }

  private buildTextResult(input: TextReviewClientRequest): ReviewClientResult {
    const lines = input.content.split(/\r?\n/);
    const firstContentLine = lines.findIndex((line) => line.trim().length > 0);
    const lineStart = firstContentLine === -1 ? 1 : firstContentLine + 1;

    const annotation: TextAnnotationDraft = {
      kind: "text",
      lineStart,
      lineSource: "text",
      comment: `Stub review note for ${input.title} on line ${lineStart}`
    };

    return { annotations: [annotation] };
  }

  private buildDiffResult(input: DiffReviewClientRequest): ReviewClientResult {
    for (const file of input.files) {
      const changedLine = findFirstChangedLine(file);
      if (!changedLine) {
        continue;
      }

      const annotation: DiffAnnotationDraft = {
        kind: "diff",
        filePath: file.displayPath,
        lineStart: changedLine.lineNumber,
        lineSource: changedLine.lineSource,
        comment: `Stub review note for ${file.displayPath}:${changedLine.lineNumber}`
      };

      return { annotations: [annotation] };
    }

    return { annotations: [] };
  }
}
