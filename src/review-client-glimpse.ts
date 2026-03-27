import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prompt } from "glimpseui";
import type { ReviewClient } from "./review-client.js";
import type { ReviewBridgeInit, ReviewBridgeMessage, ReviewClientRequest, ReviewClientResult } from "./types.js";

const REVIEW_UI_BOOTSTRAP_MARKER = "<!-- PIANNOTATOR_BOOTSTRAP -->";

export interface GlimpseReviewClientOptions {
  htmlPath?: string;
  loadHtml?: () => Promise<string>;
  promptImpl?: typeof prompt;
}

export class GlimpseReviewClient implements ReviewClient {
  private readonly loadHtml: () => Promise<string>;
  private readonly promptImpl: typeof prompt;

  constructor(options: GlimpseReviewClientOptions = {}) {
    const htmlPath = options.htmlPath ?? getDefaultReviewUiPath();
    this.loadHtml = options.loadHtml ?? (() => readFile(htmlPath, "utf8"));
    this.promptImpl = options.promptImpl ?? prompt;
  }

  async requestReview(input: ReviewClientRequest): Promise<ReviewClientResult | null> {
    let template: string;
    try {
      template = await this.loadHtml();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load review UI template. Run npm run build first. Original error: ${message}`);
    }

    const html = buildReviewWindowHtml(template, {
      title: input.title,
      mode: input.mode,
      content: input.content,
      files: input.files,
      annotations: []
    });

    const message = (await this.promptImpl(html, {
      width: 1200,
      height: 800,
      title: input.title
    })) as ReviewBridgeMessage | null;

    if (!message || message.type === "cancel") {
      return null;
    }

    return {
      annotations: message.annotations
    };
  }
}

export function buildReviewWindowHtml(template: string, payload: ReviewBridgeInit): string {
  if (!template.includes(REVIEW_UI_BOOTSTRAP_MARKER)) {
    throw new Error("Review UI template is malformed: missing bootstrap marker. Run npm run build again.");
  }

  const bootstrap = `<script>window.__PIANNOTATOR_INIT__ = ${serializeForInlineScript(payload)};<\/script>`;
  return template.replace(REVIEW_UI_BOOTSTRAP_MARKER, bootstrap);
}

export function getDefaultReviewUiPath(): string {
  const sourceFile = fileURLToPath(import.meta.url);
  const sourceDir = path.dirname(sourceFile);
  const directCandidate = path.resolve(sourceDir, "../dist/review-ui.html");
  if (existsSync(directCandidate)) {
    return directCandidate;
  }

  const compiledCandidate = path.resolve(sourceDir, "../../dist/review-ui.html");
  return compiledCandidate;
}

function serializeForInlineScript(payload: ReviewBridgeInit): string {
  return JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
