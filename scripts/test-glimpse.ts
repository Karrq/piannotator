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

// Generate a realistic multi-file diff
function makePatch(filePath: string, oldLines: string[], newLines: string[]): string {
  const header = [
    `diff --git a/${filePath} b/${filePath}`,
    `index 1111111..2222222 100644`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
  ];

  // Simple unified diff: show all old as context/deletions, all new as additions
  const hunks: string[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  let hunkLines: string[] = [];
  let adds = 0, dels = 0, ctx = 0;

  for (let i = 0; i < maxLen; i++) {
    const old = oldLines[i];
    const nw = newLines[i];
    if (old === nw && old !== undefined) {
      hunkLines.push(` ${old}`);
      ctx++;
    } else {
      if (old !== undefined) { hunkLines.push(`-${old}`); dels++; }
      if (nw !== undefined) { hunkLines.push(`+${nw}`); adds++; }
    }
  }

  const hunkHeader = `@@ -1,${oldLines.length} +1,${newLines.length} @@`;
  hunks.push(hunkHeader, ...hunkLines);

  return [...header, ...hunks].join("\n") + "\n";
}

function genLines(prefix: string, count: number, mod?: (i: number, line: string) => string): string[] {
  return Array.from({ length: count }, (_, i) => {
    const base = `  ${prefix}_line_${i + 1}: "value_${i + 1}",`;
    return mod ? mod(i, base) : base;
  });
}

// Generate test files with various sizes
const testFiles = [
  (() => {
    const old = [
      `export function sum(a: number, b: number) {`,
      `  return a + b;`,
      `}`,
    ];
    const nw = [
      `export function sum(a: number, b: number) {`,
      `  const total = a + b;`,
      `  return total;`,
      `}`,
    ];
    const patch = makePatch("src/math/sum.ts", old, nw);
    return { oldPath: "src/math/sum.ts", newPath: "src/math/sum.ts", displayPath: "src/math/sum.ts", changeType: "modified", rawDiff: patch, rawHunks: "", additions: 2, deletions: 1, hunks: [] };
  })(),
  // Large config file
  (() => {
    const old = genLines("config", 80);
    const nw = genLines("config", 80, (i, line) =>
      i >= 20 && i < 30 ? line.replace("value_", "updated_") : line
    );
    // Add some new lines
    nw.splice(50, 0, `  config_new_entry: "added",`, `  config_extra: "also_added",`);
    const patch = makePatch("src/config/settings.ts", old, nw);
    return { oldPath: "src/config/settings.ts", newPath: "src/config/settings.ts", displayPath: "src/config/settings.ts", changeType: "modified", rawDiff: patch, rawHunks: "", additions: 12, deletions: 10, hunks: [] };
  })(),
  // Component file
  (() => {
    const old = [
      `import React from "react";`,
      ``,
      `interface Props {`,
      `  title: string;`,
      `  count: number;`,
      `}`,
      ``,
      `export function Widget({ title, count }: Props) {`,
      `  return (`,
      `    <div className="widget">`,
      `      <h2>{title}</h2>`,
      `      <span>{count}</span>`,
      `    </div>`,
      `  );`,
      `}`,
    ];
    const nw = [
      `import React, { useState } from "react";`,
      ``,
      `interface Props {`,
      `  title: string;`,
      `  count: number;`,
      `  onIncrement?: () => void;`,
      `}`,
      ``,
      `export function Widget({ title, count, onIncrement }: Props) {`,
      `  const [expanded, setExpanded] = useState(false);`,
      ``,
      `  return (`,
      `    <div className="widget">`,
      `      <h2 onClick={() => setExpanded(!expanded)}>{title}</h2>`,
      `      {expanded && <span className="widget__count">{count}</span>}`,
      `      {onIncrement && <button onClick={onIncrement}>+</button>}`,
      `    </div>`,
      `  );`,
      `}`,
    ];
    const patch = makePatch("src/ui/Widget.tsx", old, nw);
    return { oldPath: "src/ui/Widget.tsx", newPath: "src/ui/Widget.tsx", displayPath: "src/ui/Widget.tsx", changeType: "modified", rawDiff: patch, rawHunks: "", additions: 7, deletions: 3, hunks: [] };
  })(),
  // Large data file
  ...["models", "routes", "handlers", "middleware", "validators", "helpers", "constants"].map((name) => {
    const old = genLines(name, 60);
    const nw = genLines(name, 60, (i, line) =>
      i % 15 === 0 ? line.replace("value_", "v2_") : line
    );
    nw.push(`  ${name}_footer: "end",`);
    const filePath = `src/server/${name}.ts`;
    const patch = makePatch(filePath, old, nw);
    return { oldPath: filePath, newPath: filePath, displayPath: filePath, changeType: "modified" as const, rawDiff: patch, rawHunks: "", additions: 5, deletions: 4, hunks: [] };
  }),
  // New file
  (() => {
    const nw = [
      `// Migration script`,
      `export async function migrate() {`,
      ...Array.from({ length: 40 }, (_, i) => `  await step${i + 1}();`),
      `}`,
    ];
    const header = [
      `diff --git a/scripts/migrate.ts b/scripts/migrate.ts`,
      `new file mode 100644`,
      `index 0000000..2222222`,
      `--- /dev/null`,
      `+++ b/scripts/migrate.ts`,
      `@@ -0,0 +1,${nw.length} @@`,
      ...nw.map(l => `+${l}`),
    ].join("\n") + "\n";
    return { oldPath: "/dev/null", newPath: "scripts/migrate.ts", displayPath: "scripts/migrate.ts", changeType: "added", rawDiff: header, rawHunks: "", additions: nw.length, deletions: 0, hunks: [] };
  })(),
  // Deleted file
  (() => {
    const old = Array.from({ length: 25 }, (_, i) => `  legacy_${i + 1}: true,`);
    const header = [
      `diff --git a/src/legacy.ts b/src/legacy.ts`,
      `deleted file mode 100644`,
      `index 2222222..0000000`,
      `--- a/src/legacy.ts`,
      `+++ /dev/null`,
      `@@ -1,${old.length} +0,0 @@`,
      ...old.map(l => `-${l}`),
    ].join("\n") + "\n";
    return { oldPath: "src/legacy.ts", newPath: "/dev/null", displayPath: "src/legacy.ts", changeType: "deleted", rawDiff: header, rawHunks: "", additions: 0, deletions: old.length, hunks: [] };
  })(),
];

const allPatches = testFiles.map(f => f.rawDiff).join("\n");

const initData = JSON.stringify({
  title: "Test Review - Multi File",
  command: "test-cmd",
  content: allPatches,
  files: testFiles,
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

const win = open("", { width: 1100, height: 750, title: "Piannotator Test", hidden: true });
let stage = "blank";
win.on("ready", () => {
  if (stage === "blank") { stage = "loading"; win.loadFile(tmpPath); return; }
  if (stage === "loading") { stage = "ready"; win.show({ title: "Piannotator Test" }); }
});
win.on("closed", () => process.exit(0));
