import assert from "node:assert/strict";
import annotateExtension from "../src/index.js";

process.env.PIANNOTATOR_REVIEW_CLIENT = "stub";

const diffFixture = `diff --git a/src/example.ts b/src/example.ts
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

type ToolDefinition = {
  name: string;
  parameters?: any;
  execute: (...args: any[]) => Promise<any>;
};

type CommandDefinition = {
  description?: string;
  handler: (...args: any[]) => Promise<any>;
};

const tools = new Map<string, ToolDefinition>();
const commands = new Map<string, CommandDefinition>();
const handlers = new Map<string, Array<(...args: any[]) => any>>();
const sentMessages: Array<{ message: any; options: any }> = [];
const appendedEntries: Array<{ customType: string; data: any }> = [];
let jjRefCallCount = 0;

const api = {
  on(event: string, handler: (...args: any[]) => any) {
    const list = handlers.get(event) ?? [];
    list.push(handler);
    handlers.set(event, list);
  },
  registerTool(tool: ToolDefinition) {
    tools.set(tool.name, tool);
  },
  registerCommand(name: string, options: CommandDefinition) {
    commands.set(name, options);
  },
  registerMessageRenderer(_customType: string, _renderer: any) {},
  sendMessage(message: any, options: any) {
    sentMessages.push({ message, options });
  },
  appendEntry(customType: string, data: any) {
    appendedEntries.push({ customType, data });
  },
  async exec(command: string, args: string[]) {
    if (command === "jj" && args.join(" ") === "log -r @ -T commit_id --no-graph") {
      jjRefCallCount += 1;
      const ref = jjRefCallCount === 1 ? "base-ref\n" : "updated-ref\n";
      return { stdout: ref, stderr: "", code: 0 };
    }

    const shellCommand = args[1];
    if (typeof shellCommand === "string") {
      const unwrapped = shellCommand.replace(/^.*?;\s*(?=\S)/, "").replace(/^.*?;\s*(?=\S)/, "").replace(/^.*?;\s*/, "");
      if (unwrapped === "emit-diff" || shellCommand.endsWith("emit-diff")) {
        return { stdout: diffFixture, stderr: "", code: 0 };
      }

      if (unwrapped === "emit-stderr" || shellCommand.endsWith("emit-stderr")) {
        return { stdout: "", stderr: "only stderr", code: 1 };
      }

      if (
        unwrapped.includes("jj diff --from 'base-ref' --git") ||
        unwrapped.includes("jj diff --from 'updated-ref' --git")
      ) {
        return { stdout: diffFixture, stderr: "", code: 0 };
      }
    }

    throw new Error(`Unexpected exec command in smoke test: ${command} ${args.join(" ")}`);
  }
};

annotateExtension(api as any);

const annotateTool = tools.get("annotate");
if (!annotateTool) {
  throw new Error("annotate tool was not registered");
}

const annotateCommand = commands.get("annotate");
if (!annotateCommand) {
  throw new Error("/annotate command was not registered");
}

assert.equal(annotateTool.parameters?.type, "object");
assert.deepEqual(annotateTool.parameters?.properties?.action?.enum, ["request", "detail"]);

const emptyCtx = {
  sessionManager: {
    getBranch() {
      return [];
    }
  }
};

// Session baseline ref capture
const sessionStartHandlers = handlers.get("session_start") ?? [];
assert.equal(sessionStartHandlers.length, 1);
await sessionStartHandlers[0]({}, emptyCtx as any);
assert.deepEqual(appendedEntries, [{ customType: "annotate-ref", data: { ref: "base-ref" } }]);

// Diff command request
const diffRequest = await annotateTool.execute(
  "tool-call-1",
  { action: "request", command: "emit-diff" },
  undefined,
  undefined,
  emptyCtx
);
assert.match(diffRequest.content[0].text, /Review review-1/);
assert.equal(diffRequest.details.review.id, "review-1");
assert.equal(diffRequest.details.review.annotations.length, 1);
assert.equal(diffRequest.details.review.annotations[0].filePath, "src/example.ts");
assert.equal(diffRequest.details.review.versions.length, 1);
assert.equal(diffRequest.details.review.versions[0].files.length, 1);

// Verify request result includes diff annotation overview
assert.match(diffRequest.content[0].text, /Version 1/);
assert.match(diffRequest.content[0].text, /src\/example.ts:/);

// Detail lookup - single ID
const diffDetail = await annotateTool.execute(
  "tool-call-2",
  { action: "detail", reviewId: "review-1", annotationIds: ["A1"] },
  undefined,
  undefined,
  emptyCtx
);
assert.match(diffDetail.content[0].text, /Annotation A1 in src\/example.ts:/);
assert.match(diffDetail.content[0].text, /Context \(@@ -1,4 \+1,5 @@\):/);

// Detail lookup - missing ID is noted inline
const missingDetail = await annotateTool.execute(
  "tool-call-2b",
  { action: "detail", reviewId: "review-1", annotationIds: ["A1", "A99"] },
  undefined,
  undefined,
  emptyCtx
);
assert.match(missingDetail.content[0].text, /Annotation A1 in src\/example.ts:/);
assert.match(missingDetail.content[0].text, /Annotation A99 was not found/);

// Detail lookup - range expansion
const rangeDetail = await annotateTool.execute(
  "tool-call-2c",
  { action: "detail", reviewId: "review-1", annotationIds: ["A1..A1"] },
  undefined,
  undefined,
  emptyCtx
);
assert.match(rangeDetail.content[0].text, /Annotation A1 in src\/example.ts:/);

// Stderr-only command
const stderrRequest = await annotateTool.execute(
  "tool-call-3",
  { action: "request", command: "emit-stderr" },
  undefined,
  undefined,
  emptyCtx
);
assert.match(stderrRequest.details.review.source.content, /^\[stderr\]\nonly stderr$/);

// Missing command
const noCommandRequest = await annotateTool.execute(
  "tool-call-4",
  { action: "request" },
  undefined,
  undefined,
  emptyCtx
);
assert.equal(noCommandRequest.details.error, "annotate.request requires a command.");

// Bare /annotate uses code diff since baseline plus one stitched assistant message file
const commandCtx = {
  hasUI: false,
  ui: {
    notify() {},
  },
  sessionManager: {
    getBranch() {
      return [
        {
          type: "message",
          timestamp: "2026-03-28T10:00:00.000Z",
          message: {
            role: "user",
            content: [{ type: "text", text: "please review this turn" }]
          }
        },
        {
          type: "message",
          timestamp: "2026-03-28T10:01:02.000Z",
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "First assistant message." },
              { type: "thinking", thinking: "hidden" }
            ]
          }
        },
        {
          type: "message",
          timestamp: "2026-03-28T10:02:03.000Z",
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "Second assistant message." }
            ]
          }
        }
      ];
    }
  }
};

await annotateCommand.handler("", commandCtx as any);
assert.equal(sentMessages.length, 1);
assert.equal(sentMessages[0].message.customType, "annotate");
assert.equal(sentMessages[0].options.triggerTurn, true);
assert.equal(sentMessages[0].message.details.lastReviewRef, "updated-ref");
const commandReviews = sentMessages[0].message.details.reviews;
const commandVersion = commandReviews[commandReviews.length - 1].versions[0];
const commandReviewFiles = commandVersion.files.map((file: any) => file.displayPath);
assert.deepEqual(commandReviewFiles, [
  "src/example.ts",
  "assistant-messages.md"
]);
const assistantMessagesFile = commandVersion.files.find((file: any) => file.displayPath === "assistant-messages.md");
assert.match(assistantMessagesFile?.rawDiff ?? "", /## 2026-03-28T10:01:02.000Z/);
assert.match(assistantMessagesFile?.rawDiff ?? "", /First assistant message\./);
assert.match(assistantMessagesFile?.rawDiff ?? "", /## 2026-03-28T10:02:03.000Z/);
assert.match(assistantMessagesFile?.rawDiff ?? "", /Second assistant message\./);

console.log("Annotate stub smoke test passed.");
