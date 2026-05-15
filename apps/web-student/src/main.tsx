import React from "react";
import ReactDOM from "react-dom/client";

// Shared design system tokens — defines :root (dark) and [data-theme=light]
// palettes. The active theme is selected by the boot script in
// index.html before React mounts (avoids dark→light flash).
import "@alp/design-system/tokens.css";

// Aurora primitives (Button, Tag, Card, Avatar, EmptyState, Skeleton, …).
// Component CSS must load AFTER the token sheet so its custom-property
// references resolve to the active theme + density.
import "@alp/ui/ui.css";

import { App } from "./App";
import { ThemeProvider } from "./lib/theme";
import { DensityProvider } from "./lib/density";

// Surface fatal errors to the page so a blank-screen failure isn't silent.
// (Keeps until staging gets proper observability.)
function showFatal(label: string, msg: string, stack?: string) {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <pre style="margin:0;padding:24px;font:13px ui-monospace,monospace;color:#a51c30;background:#fff5f5;white-space:pre-wrap;word-break:break-word;min-height:100vh;">
<strong>${label}</strong>

${msg}

${stack ?? ""}
    </pre>`;
}

// Detect stale-bundle chunk-load failures. When we redeploy, the
// browser keeps using the JS modules from the previous visit; the
// next dynamic import fails because the chunk hash no longer exists.
// The browser surfaces this as "TypeError: Failed to fetch" or
// "error loading dynamically imported module". Auto-reload once so
// the user gets the new bundle without a blank screen.
const RELOAD_FLAG = "__alp_reloaded_once";
function isStaleBundleError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("loading chunk") ||
    m.includes("loading dynamically imported module") ||
    m.includes("importing a module script failed")
  );
}
function maybeReloadForStaleBundle(reason: unknown): boolean {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (!isStaleBundleError(msg)) return false;
  if (sessionStorage.getItem(RELOAD_FLAG)) return false;
  sessionStorage.setItem(RELOAD_FLAG, "1");
  // Replace, not push — keeps history clean.
  window.location.replace(window.location.href);
  return true;
}

window.addEventListener("error", (e) => {
  if (maybeReloadForStaleBundle(e.error ?? e.message)) return;
  showFatal("Uncaught error", e.message, e.error?.stack);
});
window.addEventListener("unhandledrejection", (e) => {
  if (maybeReloadForStaleBundle(e.reason)) return;
  showFatal("Unhandled promise rejection", String(e.reason), (e.reason as Error)?.stack);
});

// Clear the flag after a successful render (give it 5s so SPA had
// time to fetch its initial chunks).
setTimeout(() => sessionStorage.removeItem(RELOAD_FLAG), 5000);

try {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ThemeProvider>
        <DensityProvider>
          <App />
        </DensityProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
} catch (err) {
  const e = err as Error;
  showFatal("React render threw synchronously", e.message, e.stack);
}
