import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const distCli = path.join(rootDir, "dist/review.mjs");

assert.ok(existsSync(distCli), "dist/review.mjs should exist after build");

const content = await readFile(distCli, "utf8");

assert.ok(content.startsWith("#!/usr/bin/env node"), "CLI bundle should have a shebang line");
assert.match(content, /wrapWithFullContext/, "CLI bundle should include the full-context wrapper");
assert.match(content, /buildReviewWindowHtml/, "CLI bundle should include HTML builder");
assert.match(content, /parseDiff/, "CLI bundle should include the diff parser");
assert.match(content, /extractDiffContext/, "CLI bundle should include context extraction");
assert.match(content, /localhost/, "CLI bundle should reference localhost for the HTTP server");

// Verify it does NOT bundle glimpseui (native addon)
assert.doesNotMatch(content, /require\("glimpseui"\)/, "CLI bundle should not require glimpseui");

console.log("CLI bundle validation passed.");
