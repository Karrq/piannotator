import { findFirstChangedLine } from "./diff-parser.js";
import type { ReviewClient, ReviewClientOptions } from "./review-client.js";
import type {
  AnnotationDraft,
  ReviewClientRequest,
  ReviewClientResult
} from "./types.js";

const STUB_CANCEL_TOKEN = "[[stub-cancel]]";

export class StubReviewClient implements ReviewClient {
  async requestReview(input: ReviewClientRequest, _options?: ReviewClientOptions): Promise<ReviewClientResult | null> {
    if (input.content.includes(STUB_CANCEL_TOKEN)) {
      return null;
    }

    return this.buildDiffResult(input);
  }

  private buildDiffResult(input: ReviewClientRequest): ReviewClientResult {
    const annotations: AnnotationDraft[] = [];

    for (const file of input.files) {
      const changedLine = findFirstChangedLine(file);
      if (!changedLine) {
        continue;
      }

      annotations.push({
        filePath: file.displayPath,
        lineStart: changedLine.lineNumber,
        lineSource: changedLine.lineSource,
        comment: `Stub review note for ${file.displayPath}:${changedLine.lineNumber}`
      });
      break;
    }

    return {
      versions: [{ command: input.command, annotations, files: input.files }]
    };
  }
}
