import type { ReviewClientRequest, ReviewClientResult } from "./types.js";

export interface ReviewClient {
  requestReview(input: ReviewClientRequest): Promise<ReviewClientResult | null>;
}
