import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { open, prompt } from "glimpseui";
import type { ReviewClient } from "./review-client.js";
import type { ReviewBridgeInit, ReviewBridgeMessage, ReviewClientRequest, ReviewClientResult } from "./types.js";

const REVIEW_UI_BOOTSTRAP_MARKER = "<!-- PIANNOTATOR_BOOTSTRAP -->";
const REVIEW_WINDOW_OPTIONS = {
  width: 1200,
  height: 800
} as const;

export interface GlimpseReviewClientOptions {
  htmlPath?: string;
  loadHtml?: () => Promise<string>;
  promptImpl?: typeof prompt;
}

export class GlimpseReviewClient implements ReviewClient {
  private readonly loadHtml: () => Promise<string>;
  private readonly promptImpl?: typeof prompt;

  constructor(options: GlimpseReviewClientOptions = {}) {
    const htmlPath = options.htmlPath ?? getDefaultReviewUiPath();
    this.loadHtml = options.loadHtml ?? (() => readFile(htmlPath, "utf8"));
    this.promptImpl = options.promptImpl;
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

    const message = this.promptImpl
      ? ((await this.promptImpl(html, {
          ...REVIEW_WINDOW_OPTIONS,
          title: input.title
        })) as ReviewBridgeMessage | null)
      : await promptWithReloadableFile(input.title, html);

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

async function promptWithReloadableFile(title: string, html: string): Promise<ReviewBridgeMessage | null> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "piannotator-review-"));
  const htmlPath = path.join(tempDir, "review-ui.html");

  try {
    await writeFile(htmlPath, html, "utf8");
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }

  let win: ReturnType<typeof open>;
  try {
    // Glimpse prompt() loads HTML with loadHTMLString(), which makes WKWebView reload
    // unreliable from the context menu. Loading a temp file keeps reload stable.
    win = open("", {
      ...REVIEW_WINDOW_OPTIONS,
      title,
      autoClose: true,
      hidden: true
    });
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }

  let stage: "blank" | "file-loading" | "ready" = "blank";

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = async () => {
      await rm(tempDir, { recursive: true, force: true });
    };

    const resolveOnce = (value: ReviewBridgeMessage | null) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup().then(
        () => resolve(value),
        (error) => reject(error)
      );
    };

    const rejectOnce = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup().then(
        () => reject(error),
        (cleanupError) => reject(cleanupError)
      );
    };

    win.on("ready", () => {
      if (stage === "blank") {
        stage = "file-loading";
        win.loadFile(htmlPath);
        return;
      }

      if (stage === "file-loading") {
        stage = "ready";
      }

      win.show({ title });
    });

    win.once("message", (data) => {
      resolveOnce(data as ReviewBridgeMessage);
    });

    win.once("closed", () => {
      resolveOnce(null);
    });

    win.once("error", (error) => {
      rejectOnce(error);
    });
  });
}

function serializeForInlineScript(payload: ReviewBridgeInit): string {
  return JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
