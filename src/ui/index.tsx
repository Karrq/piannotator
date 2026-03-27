import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";
import type {
  ReviewBridgeExtensionMessage,
  ReviewBridgeInit,
  ReviewBridgeMessage
} from "../types.js";


declare global {
  interface Window {
    __PIANNOTATOR_INIT__?: ReviewBridgeInit;
    __PIANNOTATOR_RECEIVE__?: (message: ReviewBridgeExtensionMessage) => void;
    glimpse?: {
      send: (message: ReviewBridgeMessage) => void;
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

// Listeners registered by App for extension-to-UI messages
const extensionMessageListeners: Array<(msg: ReviewBridgeExtensionMessage) => void> = [];

window.__PIANNOTATOR_RECEIVE__ = (message: ReviewBridgeExtensionMessage) => {
  for (const listener of extensionMessageListeners) {
    listener(message);
  }
};

// Glimpse's WKWebView has been flaky with JSX in this entry module.
// Using createElement here keeps the bundled entry stable.
root.render(
  React.createElement(App, {
    init,
    onSubmit: (versions, overallComment) => {
      window.glimpse?.send({ type: "submit", versions, overallComment });
    },
    onCancel: () => {
      if (window.glimpse?.send) {
        window.glimpse.send({ type: "cancel" });
        return;
      }

      window.glimpse?.close?.();
    },
    onRerunCommand: (command: string) => {
      window.glimpse?.send({ type: "rerun", command });
    },
    onExtensionMessage: (listener) => {
      extensionMessageListeners.push(listener);
      return () => {
        const index = extensionMessageListeners.indexOf(listener);
        if (index >= 0) {
          extensionMessageListeners.splice(index, 1);
        }
      };
    }
  })
);

function createFallbackInit(): ReviewBridgeInit {
  return {
    title: "Piannotator preview",
    content: [
      "This is a local preview payload.",
      "Use it to validate the bundled shell before the full review UI lands.",
      "The real extension injects window.__PIANNOTATOR_INIT__ at runtime."
    ].join("\n"),
    files: [],
    annotations: []
  };
}
