/**
 * Quick Glimpse test harness.
 * Usage: npx tsx scripts/test-glimpse.ts [message]
 * Opens the built review-ui.html with test data and shows [message] at top.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distHtml = path.join(rootDir, "dist", "review-ui.html");

const message = process.argv.slice(2).join(" ") || "No specific instructions.";

const html = fs.readFileSync(distHtml, "utf8");

const patch = `diff --git a/src/example.ts b/src/example.ts
index 1111111..2222222 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,4 +1,5 @@
 export function sum(a: number, b: number) {
-  return a + b;
+  const total = a + b;
+  return total;
 }
`;

const initData = JSON.stringify({
  title: "Test Review",
  command: "test-cmd",
  content: patch,
  files: [{
    oldPath: "src/example.ts",
    newPath: "src/example.ts",
    displayPath: "src/example.ts",
    changeType: "modified",
    rawDiff: patch,
    rawHunks: "",
    additions: 2,
    deletions: 1,
    hunks: []
  }]
});

const banner = `<div style="position:fixed;bottom:0;left:0;right:0;z-index:999;padding:8px 16px;background:#1f6feb;color:#fff;font:13px/1.4 sans-serif;text-align:center;">${message.replace(/</g, "&lt;")}</div>`;

const injectedHtml = html.replace(
  "<!-- PIANNOTATOR_BOOTSTRAP -->",
  `<script>window.__PIANNOTATOR_INIT__ = ${initData};</script>${banner}`
);

const tmpPath = "/tmp/piannotator-test.html";
fs.writeFileSync(tmpPath, injectedHtml);

// Dynamic import glimpseui (it's CJS)
const { open } = await import("glimpseui");

const win = open("", { width: 1000, height: 700, title: "Piannotator Test", hidden: true });
let stage = "blank";
win.on("ready", () => {
  if (stage === "blank") { stage = "loading"; win.loadFile(tmpPath); return; }
  if (stage === "loading") { stage = "ready"; win.show({ title: "Piannotator Test" }); }
});
win.on("closed", () => process.exit(0));
