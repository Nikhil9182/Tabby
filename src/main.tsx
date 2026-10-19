import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register service worker for offline PWA capabilities in production
if ("serviceWorker" in navigator && (import.meta.env.PROD || import.meta.env.VITE_ENABLE_SW === "true")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.addEventListener("statechange", () => {
              if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                console.info("[Tabby] New version available; refresh to update.");
              }
            });
          }
        });
      })
      .catch((error) => {
        console.error("[Tabby] Service worker registration failed:", error);
      });
  });
}

