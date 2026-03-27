import assert from "node:assert/strict";
import { GlimpseReviewClient } from "../src/review-client-glimpse.js";

const htmlTemplate = `<!doctype html><html><body><!-- PIANNOTATOR_BOOTSTRAP --><div id="piannotator-root"></div></body></html>`;

const client = new GlimpseReviewClient({
  loadHtml: async () => htmlTemplate,
  promptImpl: async (html) => {
    assert.match(html, /window.__PIANNOTATOR_INIT__/, "expected bootstrap payload in prompt HTML");
    assert.match(html, /sample review/, "expected serialized title in prompt HTML");
    return {
      type: "submit",
      annotations: [
        {
          kind: "text",
          lineSource: "text",
          lineStart: 2,
          comment: "Looks good"
        }
      ]
    };
  }
});

const result = await client.requestReview({
  title: "sample review",
  mode: "text",
  content: "line 1\nline 2",
  files: []
});

assert.ok(result, "expected submit result");
assert.equal(result?.annotations.length, 1);
assert.equal(result?.annotations[0].kind, "text");

const cancelledClient = new GlimpseReviewClient({
  loadHtml: async () => htmlTemplate,
  promptImpl: async () => ({ type: "cancel" })
});

const cancelled = await cancelledClient.requestReview({
  title: "cancel review",
  mode: "text",
  content: "line 1",
  files: []
});
assert.equal(cancelled, null);

await assert.rejects(
  async () =>
    new GlimpseReviewClient({
      loadHtml: async () => "<html><body>broken</body></html>",
      promptImpl: async () => ({ type: "cancel" })
    }).requestReview({
      title: "broken review",
      mode: "text",
      content: "line 1",
      files: []
    }),
  /missing bootstrap marker/
);

console.log("Glimpse client validation passed.");
