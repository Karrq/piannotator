import { execSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractDiffContext, isUnifiedDiff, parseDiff } from "./diff-parser.js";
import { buildReviewWindowHtml } from "./review-client-glimpse.js";
import {
  formatAnnotationReference,
  type AnnotationDraft,
  type DiffContextLine,
  type ReviewBridgeSubmitMessage,
  type ReviewFile,
} from "./types.js";

// -- Arg parsing --

interface CliArgs {
  command: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const dashDash = args.indexOf("--");

  if (dashDash === -1 || dashDash === args.length - 1) {
    console.error("Usage: review.mjs -- <diff-command>");
    process.exit(2);
  }

  const command = args.slice(dashDash + 1).join(" ");
  return { command };
}

// -- Full-context wrapping --

function wrapWithFullContext(command: string): string {
  const preamble = [
    `git(){ case "$1" in diff|log|show) local subcmd="$1"; shift; command git -c diff.context=999999999 --no-pager "$subcmd" --no-ext-diff "$@";; *) command git "$@";; esac; }`,
    `jj(){ command jj --config 'diff.git.context=999999999' "$@"; }`,
  ].join("; ");
  return `${preamble}; ${command}`;
}

// -- Command execution --

function runDiffCommand(command: string): string {
  try {
    return execSync(`sh -lc ${shellArg(wrapWithFullContext(command))}`, {
      encoding: "utf8",
      maxBuffer: 100 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err: unknown) {
    // execSync throws on non-zero exit; stdout may still contain the diff
    if (err && typeof err === "object" && "stdout" in err) {
      const stdout = (err as { stdout: string }).stdout;
      if (typeof stdout === "string" && stdout.trim().length > 0) {
        return stdout;
      }
    }
    console.error(`Command failed: ${command}`);
    process.exit(1);
  }
}

function shellArg(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

// -- Glimpse shim --

function buildGlimpseShim(port: number): string {
  const done = [
    `function __done(label) {`,
    `  document.title = label;`,
    `  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;'`,
    `    + 'font-family:system-ui;color:#888;font-size:1.2rem">' + label + '. You can close this tab.</div>';`,
    `  try { window.close(); } catch(e) {}`,
    `}`,
  ].join("\n");

  return [
    done,
    `window.glimpse = {`,
    `  send(message) {`,
    `    fetch('http://localhost:${port}/submit', {`,
    `      method: 'POST',`,
    `      headers: { 'Content-Type': 'application/json' },`,
    `      body: JSON.stringify(message)`,
    `    }).then(function() { __done('Review submitted'); });`,
    `  },`,
    `  close() {`,
    `    fetch('http://localhost:${port}/submit', {`,
    `      method: 'POST',`,
    `      headers: { 'Content-Type': 'application/json' },`,
    `      body: JSON.stringify({ type: 'cancel' })`,
    `    }).then(function() { __done('Review cancelled'); });`,
    `  }`,
    `};`,
  ].join("\n");
}

// -- HTTP server --

interface ServerHandle {
  port: number;
  waitForResult: () => Promise<ReviewBridgeSubmitMessage | null>;
  close: () => void;
}

function startServer(getHtml: () => string): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    let resultResolve: (value: ReviewBridgeSubmitMessage | null) => void;
    const resultPromise = new Promise<ReviewBridgeSubmitMessage | null>((res) => {
      resultResolve = res;
    });

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method === "GET" && (req.url === "/" || req.url === "")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(getHtml());
        return;
      }

      if (req.method === "POST" && req.url === "/submit") {
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end("{}");

          try {
            const message = JSON.parse(body);
            if (message.type === "cancel") {
              resultResolve(null);
            } else if (message.type === "submit") {
              resultResolve(message as ReviewBridgeSubmitMessage);
            }
          } catch {
            // Malformed JSON - ignore
          }
        });
        return;
      }

      // CORS preflight
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    server.listen(0, "localhost", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to bind server"));
        return;
      }
      resolve({
        port: addr.port,
        waitForResult: () => resultPromise,
        close: () => server.close(),
      });
    });

    server.on("error", reject);
  });
}

// -- Browser open --

function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    execSync(`${command} ${shellArg(url)}`, { stdio: "ignore" });
  } catch {
    console.error(`Failed to open browser. Visit: ${url}`);
  }
}

// -- Output formatting --

function formatOutput(
  result: ReviewBridgeSubmitMessage,
  allFiles: ReviewFile[]
): string {
  const parts: string[] = [];

  if (result.overallComment?.trim()) {
    parts.push(`Overall comment:\n  ${result.overallComment.trim().split(/\r?\n/).join("\n  ")}`);
  }

  const allAnnotations: Array<AnnotationDraft & { id: string; files: ReviewFile[] }> = [];
  for (const version of result.versions) {
    const versionFiles = version.files ?? allFiles;
    for (const draft of version.annotations) {
      const id = `A${allAnnotations.length + 1}`;
      allAnnotations.push({ ...draft, id, files: versionFiles });
    }
  }

  for (const annotation of allAnnotations) {
    const reference = formatAnnotationReference({
      ...annotation,
      id: annotation.id,
      summary: "",
    });

    const lines: string[] = [`Annotation ${annotation.id} in ${reference}`];

    const file = annotation.files.find((f) => f.displayPath === annotation.filePath);
    if (file) {
      const context = extractDiffContext(file, annotation.lineSource, annotation.lineStart, annotation.lineEnd);
      if (context) {
        lines.push("");
        lines.push(`Context (${context.hunkHeader}):`);
        lines.push(...formatDiffContextLines(context.lines, annotation.lineSource));
      }
    }

    lines.push("");
    lines.push("Comment:");
    lines.push(...annotation.comment.split(/\r?\n/).map((l) => `  ${l}`));

    parts.push(lines.join("\n"));
  }

  return parts.join("\n\n---\n\n");
}

function formatDiffContextLines(
  lines: DiffContextLine[],
  lineSource: "old" | "new"
): string[] {
  const lineNumbers = lines
    .map((line) => (lineSource === "new" ? line.newLineNumber : line.oldLineNumber))
    .filter((v): v is number => v !== undefined);
  const width = String(lineNumbers.length > 0 ? Math.max(...lineNumbers) : 0).length || 1;

  return lines.map((line) => {
    const prefix = line.annotated ? ">" : " ";
    const sign = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
    const rawLineNumber = lineSource === "new" ? line.newLineNumber : line.oldLineNumber;
    const lineNumber = rawLineNumber === undefined
      ? "".padStart(width, " ")
      : String(rawLineNumber).padStart(width, " ");
    return `${prefix}${sign} ${lineNumber} | ${line.text}`;
  });
}

// -- HTML loading --

async function loadHtmlTemplate(): Promise<string> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const htmlPath = path.join(scriptDir, "review-ui.html");
  return readFile(htmlPath, "utf8");
}

// -- Main --

async function main() {
  const args = parseArgs(process.argv);

  // Run the diff command
  const output = runDiffCommand(args.command);
  if (!output.trim()) {
    console.error(`No diff output. Command: ${args.command}`);
    process.exit(1);
  }

  // Parse the diff
  const files = isUnifiedDiff(output) ? parseDiff(output) : [];

  // Load HTML template
  const template = await loadHtmlTemplate();

  // Start server with a lazy HTML getter so we can build the HTML after
  // we know the port (the glimpse shim needs the port baked in).
  let html = "";
  const server = await startServer(() => html);

  const shimScript = buildGlimpseShim(server.port);
  html = buildReviewWindowHtml(
    template,
    {
      title: args.command,
      content: output,
      files,
      annotations: [],
      command: args.command,
    },
    { extraBootstrapScripts: [shimScript] }
  );

  const url = `http://localhost:${server.port}`;
  openBrowser(url);

  // Wait for result
  const result = await server.waitForResult();
  server.close();

  if (!result) {
    console.error("Review cancelled by the user.");
    process.exit(1);
  }

  // Format and output
  const formatted = formatOutput(result, files);
  process.stdout.write(formatted + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
