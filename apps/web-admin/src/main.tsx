import React from "react";
import ReactDOM from "react-dom/client";

// Vidya v1 design tokens — supersedes Aurora v2 + per-portal accent files.
// Admin persona/density set on <html> in apps/web-admin/index.html.
import "@alp/design-system/vidya/tokens.css";
import "@alp/design-system/vidya/fonts.css";

import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
