import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ReviewClient, ReviewClientOptions } from "./review-client.js";
import { buildReviewWindowHtml, getDefaultReviewUiPath } from "./review-client-glimpse.js";
import type {
  ReviewBridgeExtensionMessage,
  ReviewBridgeInit,
  ReviewBridgeMessage,
  ReviewClientRequest,
  ReviewClientResult
} from "./types.js";

const CMUX_COMMAND_TIMEOUT_MS = 10_000;
const CMUX_WAIT_TIMEOUT_MS = 5_000;
const CMUX_GLIMPSE_SHIM = [
  "window.__PIANNOTATOR_OUTBOX__ = undefined;",
  "window.glimpse = {",
  "  send(message) {",
  "    window.__PIANNOTATOR_OUTBOX__ = JSON.parse(JSON.stringify(message));",
  "  },",
  "  close() {",
  "    window.__PIANNOTATOR_OUTBOX__ = { type: 'cancel' };",
  "  }",
  "};"
].join("\n");

type ExecResult = Awaited<ReturnType<ExtensionAPI["exec"]>>;
type ExecFn = ExtensionAPI["exec"];

export interface CmuxReviewClientOptions {
  htmlPath?: string;
  loadHtml?: () => Promise<string>;
  exec?: ExecFn;
}

export class CmuxReviewClient implements ReviewClient {
  private readonly loadHtml: () => Promise<string>;
  private readonly exec: ExecFn;

  constructor(pi: Pick<ExtensionAPI, "exec">, options: CmuxReviewClientOptions = {}) {
    const htmlPath = options.htmlPath ?? getDefaultReviewUiPath();
    this.loadHtml = options.loadHtml ?? (() => readFile(htmlPath, "utf8"));
    this.exec = options.exec ?? pi.exec.bind(pi);
  }

  async requestReview(input: ReviewClientRequest, options?: ReviewClientOptions): Promise<ReviewClientResult | null> {
    let template: string;
    try {
      template = await this.loadHtml();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load review UI template. Run npm run build first. Original error: ${message}`);
    }

    const html = buildCmuxHtml(template, {
      title: input.title,
      content: input.content,
      files: input.files,
      annotations: [],
      command: input.command
    });

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "piannotator-review-"));
    const htmlPath = path.join(tempDir, "review-ui.html");
    let surfaceRef: string | null = null;

    try {
      await writeFile(htmlPath, html, "utf8");

      const openResult = await this.expectCmux(["browser", "open-split", pathToFileURL(htmlPath).href]);
      surfaceRef = parseSurfaceRef(openResult.stdout);

      return await this.waitForReviewResult(surfaceRef, tempDir, options);
    } finally {
      if (surfaceRef) {
        await this.cleanupSurface(surfaceRef);
      }
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async waitForReviewResult(
    surfaceRef: string,
    tempDir: string,
    options?: ReviewClientOptions
  ): Promise<ReviewClientResult | null> {
    while (true) {
      const waitResult = await this.runCmux([
        "browser",
        surfaceRef,
        "wait",
        "--function",
        "window.__PIANNOTATOR_OUTBOX__ !== undefined",
        "--timeout-ms",
        String(CMUX_WAIT_TIMEOUT_MS)
      ]);

      if (waitResult.code !== 0) {
        if (!(await this.isSurfaceAlive(surfaceRef))) {
          return null;
        }

        if (isTimeoutResult(waitResult)) {
          continue;
        }

        throw new Error(`cmux browser wait failed: ${formatExecOutput(waitResult)}`);
      }

      const message = await this.readOutboxMessage(surfaceRef);
      if (!message) {
        continue;
      }

      switch (message.type) {
        case "submit":
          return {
            versions: message.versions,
            overallComment: message.overallComment
          };
        case "cancel":
          return null;
        case "rerun": {
          const callback = options?.onRerunCommand;
          if (!callback) {
            await this.deliverPayload(surfaceRef, tempDir, {
              type: "rerun-error",
              error: "Command rerun is unavailable for this review."
            });
            continue;
          }

          try {
            const result = await callback(message.command);
            await this.deliverPayload(surfaceRef, tempDir, {
              type: "update",
              content: result.content,
              files: result.files
            });
          } catch (error) {
            await this.deliverPayload(surfaceRef, tempDir, {
              type: "rerun-error",
              error: error instanceof Error ? error.message : String(error)
            });
          }
          continue;
        }
      }
    }
  }

  private async readOutboxMessage(surfaceRef: string): Promise<ReviewBridgeMessage | null> {
    const result = await this.runCmux([
      "browser",
      surfaceRef,
      "eval",
      [
        "(() => {",
        "  const message = window.__PIANNOTATOR_OUTBOX__;",
        "  window.__PIANNOTATOR_OUTBOX__ = undefined;",
        "  return message === undefined ? '' : JSON.stringify(message);",
        "})()"
      ].join("")
    ]);

    if (result.code !== 0) {
      if (!(await this.isSurfaceAlive(surfaceRef))) {
        return null;
      }
      throw new Error(`cmux browser eval failed while reading review state: ${formatExecOutput(result)}`);
    }

    const raw = result.stdout.trim();
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as ReviewBridgeMessage;
  }

  private async deliverPayload(
    surfaceRef: string,
    tempDir: string,
    payload: ReviewBridgeExtensionMessage
  ): Promise<void> {
    const payloadPath = path.join(tempDir, `payload-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
    await writeFile(payloadPath, `window.__PIANNOTATOR_RECEIVE__(${JSON.stringify(payload)});`, "utf8");

    const loader = [
      "(() => {",
      "  const existing = document.getElementById('piannotator-payload-loader');",
      "  if (existing) existing.remove();",
      "  const script = document.createElement('script');",
      "  script.id = 'piannotator-payload-loader';",
      `  script.src = ${JSON.stringify(pathToFileURL(payloadPath).href)};`,
      "  document.head.appendChild(script);",
      "  return 'ok';",
      "})()"
    ].join("");

    const result = await this.runCmux(["browser", surfaceRef, "addscript", loader]);
    if (result.code !== 0) {
      if (!(await this.isSurfaceAlive(surfaceRef))) {
        return;
      }
      throw new Error(`cmux browser addscript failed: ${formatExecOutput(result)}`);
    }
  }

  private async isSurfaceAlive(surfaceRef: string): Promise<boolean> {
    const result = await this.runCmux(["browser", surfaceRef, "eval", "1"]);
    return result.code === 0;
  }

  private async cleanupSurface(surfaceRef: string): Promise<void> {
    try {
      await this.runCmux(["close-surface", "--surface", surfaceRef]);
    } catch {
      // Best-effort cleanup.
    }
  }

  private async expectCmux(args: string[]): Promise<ExecResult> {
    const result = await this.runCmux(args);
    if (result.code === 0) {
      return result;
    }

    throw new Error(`cmux ${args.join(" ")} failed: ${formatExecOutput(result)}`);
  }

  private async runCmux(args: string[]): Promise<ExecResult> {
    return this.exec("cmux", args, { timeout: CMUX_COMMAND_TIMEOUT_MS });
  }
}

export function buildCmuxHtml(template: string, payload: ReviewBridgeInit): string {
  return buildReviewWindowHtml(template, payload, {
    extraBootstrapScripts: [CMUX_GLIMPSE_SHIM]
  });
}

function parseSurfaceRef(output: string): string {
  const match = /\bsurface=([^\s]+)/.exec(output);
  if (!match) {
    throw new Error(`Failed to parse cmux browser surface from output: ${JSON.stringify(output.trim())}`);
  }

  return match[1];
}

function isTimeoutResult(result: ExecResult): boolean {
  const text = `${result.stdout}\n${result.stderr}`;
  return /timeout/i.test(text) || /timed out waiting for javascript result/i.test(text);
}

function formatExecOutput(result: ExecResult): string {
  const parts = [result.stdout.trim(), result.stderr.trim()].filter(Boolean);
  if (parts.length === 0) {
    return `exit code ${String(result.code)}`;
  }

  return parts.join("\n");
}
