import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReviewWindowHtml } from "../src/review-client-glimpse.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const distHtmlPath = path.join(rootDir, "dist/review-ui.html");

const template = await readFile(distHtmlPath, "utf8");
assert.match(template, /PIANNOTATOR_BOOTSTRAP/, "bundle should retain the bootstrap marker for runtime injection");
assert.match(template, /piannotator-root/, "bundle should include the root mount node");

const hydrated = buildReviewWindowHtml(template, {
  title: "UI bundle validation",
  mode: "text",
  content: "line one\nline two",
  files: [],
  annotations: []
});

assert.doesNotMatch(hydrated, /PIANNOTATOR_BOOTSTRAP/, "bootstrap marker should be replaced in runtime HTML");
assert.match(hydrated, /window.__PIANNOTATOR_INIT__/, "runtime HTML should embed the init payload");
assert.match(hydrated, /UI bundle validation/, "runtime HTML should contain serialized payload content");
assert.match(hydrated, /window.__PIANNOTATOR_INIT__/, "runtime HTML should retain the bridge bootstrap script");

console.log("UI bundle validation passed.");
