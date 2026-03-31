/**
 * Test extension that consumes the piannotator API via the event bus.
 *
 * Registers a `/test-review` command that opens a review using a custom
 * ReviewClient that always returns a fixed set of annotations.
 *
 * Usage: /test-review
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { PiannotatorAPI } from "../src/api.js";
import type { ReviewClient, ReviewClientOptions } from "../src/review-client.js";
import type { ReviewClientRequest, ReviewClientResult } from "../src/types.js";

class FixedAnnotationClient implements ReviewClient {
  async requestReview(input: ReviewClientRequest, _options?: ReviewClientOptions): Promise<ReviewClientResult | null> {
    const annotations = input.files.slice(0, 3).map((file, i) => ({
      filePath: file.displayPath,
      lineStart: 1,
      lineSource: "new" as const,
      comment: `Fixed annotation ${i + 1} on ${file.displayPath}`,
    }));

    return {
      versions: [{ annotations, files: input.files }],
      overallComment: "This review was produced by the test consumer extension.",
    };
  }
}

export default function (pi: ExtensionAPI) {
  let piannotator: PiannotatorAPI | undefined;

  // Subscribe to receive the API (covers both load orderings)
  pi.events.on("piannotator", (data) => {
    piannotator = data as PiannotatorAPI;
  });

  pi.on("session_start", async (_event, ctx) => {
    // If piannotator loaded before us, we already have the API.
    // If not, request it (piannotator will re-emit when it starts).
    if (!piannotator) {
      pi.events.emit("piannotator:get_api", undefined);
    }

    if (piannotator) {
      ctx.ui.notify("Piannotator API acquired", "info");
    } else {
      ctx.ui.notify("Piannotator API not yet available - will receive on its startup", "info");
    }
  });

  pi.registerCommand("test-review", {
    description: "Test the piannotator API with a fixed-annotation client",
    handler: async (args, ctx) => {
      if (!piannotator) {
        ctx.ui.notify("Piannotator API not available. Is the extension loaded?", "error");
        return;
      }

      const diffText = args.trim() || SAMPLE_DIFF;
      const files = piannotator.utils.parseDiff(diffText);

      if (files.length === 0) {
        ctx.ui.notify("No diff files parsed from input", "warning");
        return;
      }

      ctx.ui.notify(`Parsed ${files.length} file(s), starting review...`, "info");

      const result = await piannotator.requestReview({
        title: "Test Review",
        content: diffText,
        files,
        client: new FixedAnnotationClient(),
        onMessage: async () => null,
      });

      if (!result) {
        ctx.ui.notify("Review was cancelled", "info");
        return;
      }

      const totalAnnotations = result.versions.reduce((sum, v) => sum + v.annotations.length, 0);
      ctx.ui.notify(
        `Review complete: ${totalAnnotations} annotation(s), overall: "${result.overallComment ?? "(none)"}"`,
        "info"
      );

      // Send as a message so the agent sees the result
      pi.sendMessage({
        customType: "test-review",
        content: JSON.stringify(result, null, 2),
        display: true,
      });
    },
  });
}

const SAMPLE_DIFF = `diff --git a/src/hello.ts b/src/hello.ts
index aaa..bbb 100644
--- a/src/hello.ts
+++ b/src/hello.ts
@@ -1,3 +1,4 @@
 export function hello() {
-  return "hello";
+  const greeting = "hello world";
+  return greeting;
 }
diff --git a/src/math.ts b/src/math.ts
index ccc..ddd 100644
--- a/src/math.ts
+++ b/src/math.ts
@@ -1,3 +1,3 @@
 export function add(a: number, b: number) {
-  return a + b;
+  return a + b + 0;
 }
`;
