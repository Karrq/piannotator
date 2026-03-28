import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { buildCmuxHtml, CmuxReviewClient } from "../src/review-client-cmux.js";

const htmlTemplate = "<!doctype html><html><head><!-- PIANNOTATOR_BOOTSTRAP --></head><body><div id=\"piannotator-root\"></div></body></html>";

type ExecStep = {
  assertCall?: (command: string, args: string[]) => Promise<void> | void;
  result: { stdout?: string; stderr?: string; code?: number; killed?: boolean };
};

function createExec(steps: ExecStep[]): ExtensionAPI["exec"] {
  return async (command, args) => {
    const step = steps.shift();
    if (!step) {
      throw new Error(`Unexpected exec call: ${command} ${args.join(" ")}`);
    }

    await step.assertCall?.(command, args);
    return {
      stdout: step.result.stdout ?? "",
      stderr: step.result.stderr ?? "",
      code: step.result.code ?? 0,
      killed: step.result.killed ?? false
    };
  };
}

const hydrated = buildCmuxHtml(htmlTemplate, {
  title: "sample review",
  content: "line 1\nline 2",
  files: [],
  annotations: []
});
assert.match(hydrated, /window.__PIANNOTATOR_INIT__/, "expected review bootstrap payload");
assert.match(hydrated, /window\.glimpse = \{/, "expected cmux glimpse shim");
assert.match(hydrated, /__PIANNOTATOR_OUTBOX__/, "expected cmux outbox state");

const submitClient = new CmuxReviewClient(
  { exec: createExec([
    {
      assertCall(command, args) {
        assert.equal(command, "cmux");
        assert.equal(args[0], "browser");
        assert.equal(args[1], "open-split");
        assert.match(args[2] ?? "", /^file:\/\//, "expected temp html file URL");
      },
      result: { stdout: "OK surface=surface:41 pane=pane:8 placement=split" }
    },
    {
      assertCall(command, args) {
        assert.equal(command, "cmux");
        assert.deepEqual(args.slice(0, 3), ["browser", "surface:41", "wait"]);
      },
      result: { stdout: "OK" }
    },
    {
      assertCall(command, args) {
        assert.equal(command, "cmux");
        assert.deepEqual(args.slice(0, 3), ["browser", "surface:41", "eval"]);
      },
      result: {
        stdout: JSON.stringify({
          type: "submit",
          versions: [{ annotations: [{ filePath: "test.txt", lineSource: "new", lineStart: 2, comment: "Looks good" }] }],
          overallComment: "Ship it"
        })
      }
    },
    {
      assertCall(command, args) {
        assert.equal(command, "cmux");
        assert.deepEqual(args, ["close-surface", "--surface", "surface:41"]);
      },
      result: { stdout: "OK surface:41 workspace:1" }
    }
  ]) },
  { loadHtml: async () => htmlTemplate }
);

const submitResult = await submitClient.requestReview({
  title: "submit review",
  content: "line 1",
  files: []
});
assert.ok(submitResult, "expected submit result");
assert.equal(submitResult?.versions.length, 1);
assert.equal(submitResult?.versions[0].annotations[0].filePath, "test.txt");
assert.equal(submitResult?.overallComment, "Ship it");

let rerunCalls = 0;
const rerunSteps: ExecStep[] = [
  {
    result: { stdout: "OK surface=surface:42 pane=pane:9 placement=split" }
  },
  {
    result: { stdout: "OK" }
  },
  {
    result: {
      stdout: JSON.stringify({
        type: "rerun",
        command: "git diff HEAD~1"
      })
    }
  },
  {
    assertCall: async (_command, args) => {
      assert.deepEqual(args.slice(0, 3), ["browser", "surface:42", "addscript"]);
      const match = /script\.src = ("file:\/\/[^\"]+")/.exec(args[3] ?? "");
      assert.ok(match, "expected payload script URL in addscript loader");
      const payloadUrl = JSON.parse(match[1]) as string;
      const payloadSource = await readFile(new URL(payloadUrl), "utf8");
      assert.match(payloadSource, /window.__PIANNOTATOR_RECEIVE__\(/, "expected update payload script");
      assert.match(payloadSource, /updated diff/, "expected rerun content in payload script");
    },
    result: { stdout: "OK" }
  },
  {
    result: { stdout: "OK" }
  },
  {
    result: {
      stdout: JSON.stringify({
        type: "submit",
        versions: [{ annotations: [{ filePath: "rerun.txt", lineSource: "new", lineStart: 1, comment: "After rerun" }] }]
      })
    }
  },
  {
    result: { stdout: "OK surface:42 workspace:1" }
  }
];

const rerunClient = new CmuxReviewClient(
  { exec: createExec(rerunSteps) },
  { loadHtml: async () => htmlTemplate }
);

const rerunResult = await rerunClient.requestReview(
  {
    title: "rerun review",
    content: "line 1",
    files: []
  },
  {
    async onRerunCommand(command) {
      rerunCalls += 1;
      assert.equal(command, "git diff HEAD~1");
      return {
        content: "updated diff",
        files: []
      };
    }
  }
);
assert.equal(rerunCalls, 1, "expected rerun callback to run once");
assert.ok(rerunResult, "expected rerun submit result");
assert.equal(rerunResult?.versions[0].annotations[0].filePath, "rerun.txt");

const closedClient = new CmuxReviewClient(
  { exec: createExec([
    {
      result: { stdout: "OK surface=surface:43 pane=pane:10 placement=split" }
    },
    {
      result: { stderr: "Error: js_error: Browser surface disappeared", code: 1 }
    },
    {
      assertCall(command, args) {
        assert.equal(command, "cmux");
        assert.deepEqual(args, ["browser", "surface:43", "eval", "1"]);
      },
      result: { stderr: "Error: not_found: Workspace not found", code: 1 }
    },
    {
      result: { stderr: "Error: not_found: Surface not found", code: 1 }
    }
  ]) },
  { loadHtml: async () => htmlTemplate }
);

const cancelled = await closedClient.requestReview({
  title: "closed review",
  content: "line 1",
  files: []
});
assert.equal(cancelled, null);

const delayedClient = new CmuxReviewClient(
  { exec: createExec([
    {
      result: { stdout: "OK surface=surface:44 pane=pane:11 placement=split" }
    },
    {
      result: { stderr: "Error: js_error: Timed out waiting for JavaScript result.", code: 1 }
    },
    {
      result: { stdout: "OK" }
    },
    {
      result: {
        stdout: JSON.stringify({
          type: "submit",
          versions: [{ annotations: [{ filePath: "delayed.txt", lineSource: "new", lineStart: 1, comment: "Loaded" }] }]
        })
      }
    },
    {
      result: { stdout: "OK surface:44 workspace:1" }
    }
  ]) },
  { loadHtml: async () => htmlTemplate }
);

const delayedResult = await delayedClient.requestReview({
  title: "delayed review",
  content: "line 1",
  files: []
});
assert.ok(delayedResult, "expected delayed submit result");
assert.equal(delayedResult?.versions[0].annotations[0].filePath, "delayed.txt");

await assert.rejects(
  async () =>
    new CmuxReviewClient(
      { exec: createExec([]) },
      { loadHtml: async () => "<html><body>broken</body></html>" }
    ).requestReview({
      title: "broken review",
      content: "line 1",
      files: []
    }),
  /missing bootstrap marker/
);

console.log("Cmux client validation passed.");
