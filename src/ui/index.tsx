import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";
import type { ReviewBridgeCancelMessage, ReviewBridgeInit, ReviewBridgeSubmitMessage } from "../types.js";

declare global {
  interface Window {
    __PIANNOTATOR_INIT__?: ReviewBridgeInit;
    glimpse?: {
      send: (message: ReviewBridgeSubmitMessage | ReviewBridgeCancelMessage) => void;
      close?: () => void;
    };
  }
}

const rootElement = document.getElementById("piannotator-root");
if (!rootElement) {
  throw new Error("Missing #piannotator-root mount node");
}

const root = createRoot(rootElement);
const init = window.__PIANNOTATOR_INIT__ ?? createFallbackInit();

root.render(
  <App
    init={init}
    onSubmit={(annotations) => {
      window.glimpse?.send({ type: "submit", annotations });
    }}
    onCancel={() => {
      if (window.glimpse?.send) {
        window.glimpse.send({ type: "cancel" });
        return;
      }

      window.glimpse?.close?.();
    }}
  />
);

function createFallbackInit(): ReviewBridgeInit {
  return {
    title: "Piannotator preview",
    mode: "text",
    content: [
      "This is a local preview payload.",
      "Use it to validate the bundled shell before the full review UI lands.",
      "The real extension injects window.__PIANNOTATOR_INIT__ at runtime."
    ].join("\n"),
    files: [],
    annotations: []
  };
}
