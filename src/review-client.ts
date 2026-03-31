import type { ReviewBridgeExtensionMessage, ReviewBridgeMessage, ReviewClientRequest, ReviewClientResult } from "./types.js";

export type BridgeMessageHandler = (msg: ReviewBridgeMessage) => Promise<ReviewBridgeExtensionMessage | null>;

export interface ReviewClientOptions {
  signal?: AbortSignal;
  onMessage?: BridgeMessageHandler;
}

export interface ReviewClient {
  requestReview(input: ReviewClientRequest, options?: ReviewClientOptions): Promise<ReviewClientResult | null>;
}
