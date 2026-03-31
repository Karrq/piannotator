import { isUnifiedDiff, parseDiff, textToDiff } from "./diff-parser.js";
import type { ReviewClient, BridgeMessageHandler } from "./review-client.js";
import type { ReviewClientResult, ReviewFile } from "./types.js";

export interface PiannotatorRequestOptions {
  title: string;
  content: string;
  files?: ReviewFile[];
  client: ReviewClient;
  onMessage: BridgeMessageHandler;
  signal?: AbortSignal;
}

export interface PiannotatorUtils {
  parseDiff(text: string): ReviewFile[];
  isUnifiedDiff(text: string): boolean;
  textToDiff(text: string, filename: string): string;
}

export interface PiannotatorAPI {
  requestReview(options: PiannotatorRequestOptions): Promise<ReviewClientResult | null>;
  utils: PiannotatorUtils;
}

export function createPiannotatorAPI(): PiannotatorAPI {
  const utils: PiannotatorUtils = {
    parseDiff,
    isUnifiedDiff,
    textToDiff,
  };

  return {
    async requestReview(options) {
      const files = options.files ?? (isUnifiedDiff(options.content) ? parseDiff(options.content) : []);

      const result = await options.client.requestReview(
        {
          title: options.title,
          content: options.content,
          files,
          command: undefined,
        },
        {
          signal: options.signal,
          onMessage: options.onMessage,
        }
      );

      return result;
    },

    utils,
  };
}
