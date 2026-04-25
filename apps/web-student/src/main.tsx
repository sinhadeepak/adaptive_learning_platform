import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

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

window.addEventListener("error", (e) => {
  showFatal("Uncaught error", e.message, e.error?.stack);
});
window.addEventListener("unhandledrejection", (e) => {
  showFatal("Unhandled promise rejection", String(e.reason), (e.reason as Error)?.stack);
});

try {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (err) {
  const e = err as Error;
  showFatal("React render threw synchronously", e.message, e.stack);
}
