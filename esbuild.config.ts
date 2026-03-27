import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const htmlEntry = path.join(rootDir, "src/ui/index.html");
const scriptEntry = path.join(rootDir, "src/ui/index.tsx");
const cssEntry = path.join(rootDir, "src/ui/styles.css");
const bundleDir = path.join(rootDir, "build/ui-bundle");
const distDir = path.join(rootDir, "dist");
const distHtml = path.join(distDir, "review-ui.html");

if (!existsSync(htmlEntry) || !existsSync(scriptEntry)) {
  console.log("Skipping UI bundle: src/ui/index.html or src/ui/index.tsx is missing.");
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
  minify: false,
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

const htmlTemplate = await readFile(htmlEntry, "utf8");
const javascript = await readFile(path.join(bundleDir, "review-ui.js"), "utf8");

const html = htmlTemplate
  .replace("<!-- PIANNOTATOR_STYLES -->", css ? `<style>\n${css}\n</style>` : "")
  .replace("<!-- PIANNOTATOR_SCRIPT -->", `<script>\n${javascript}\n</script>`);

await writeFile(distHtml, html, "utf8");
console.log(`Bundled review UI to ${path.relative(rootDir, distHtml)}`);
