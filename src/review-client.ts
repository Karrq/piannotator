import type { ReviewClientRequest, ReviewClientResult, ReviewFile } from "./types.js";

export interface ReviewClientOptions {
  signal?: AbortSignal;
  onRerunCommand?: (command: string) => Promise<{ content: string; files: ReviewFile[] }>;
}

export interface ReviewClient {
  requestReview(input: ReviewClientRequest, options?: ReviewClientOptions): Promise<ReviewClientResult | null>;
}
