import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const scriptEntry = path.join(rootDir, "src/ui/index.tsx");
const cssEntry = path.join(rootDir, "src/ui/styles.css");
const bundleDir = path.join(rootDir, "build/ui-bundle");
const distDir = path.join(rootDir, "dist");
const distHtml = path.join(distDir, "review-ui.html");

if (!existsSync(scriptEntry)) {
  console.log("Skipping UI bundle: src/ui/index.tsx is missing.");
  process.exit(0);
}

await rm(bundleDir, { recursive: true, force: true });
await mkdir(bundleDir, { recursive: true });
await mkdir(distDir, { recursive: true });

await build({
  absWorkingDir: rootDir,
  bundle: true,
  entryPoints: [scriptEntry],
  format: "iife",
  loader: {
    ".css": "css"
  },
  minify: true,
  outfile: path.join(bundleDir, "review-ui.js"),
  sourcemap: false,
  target: ["safari16"]
});

let css = "";
const bundledCss = path.join(bundleDir, "review-ui.css");
if (existsSync(bundledCss)) {
  css = await readFile(bundledCss, "utf8");
} else if (existsSync(cssEntry)) {
  css = await readFile(cssEntry, "utf8");
}

const javascript = await readFile(path.join(bundleDir, "review-ui.js"), "utf8");

// A compact hand-built shell renders reliably in Glimpse.
// The pretty multi-line template version opened a blank WKWebView.
const html = [
  "<!doctype html>",
  '<html lang="en">',
  "<head>",
  '<meta charset="UTF-8" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
  "<title>Piannotator</title>",
  "<!-- PIANNOTATOR_BOOTSTRAP -->",
  css ? `<style>${css}</style>` : "",
  "</head>",
  "<body>",
  '<div id="piannotator-root"></div>',
  `<script>${javascript}</script>`,
  "</body>",
  "</html>"
].join("");

await writeFile(distHtml, html, "utf8");
console.log(`Bundled review UI to ${path.relative(rootDir, distHtml)}`);
