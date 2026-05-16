import React from "react";
import ReactDOM from "react-dom/client";

// Vidya v1 design tokens — supersedes Aurora v2 + per-portal accent files.
// Admin persona/density set on <html> in apps/web-admin/index.html.
import "@alp/design-system/vidya/tokens.css";
import "@alp/design-system/vidya/density-scalars.css";
import "@alp/design-system/vidya/fonts.css";

// @alp/ui carries the vidya-shell / vidya-card CSS family the admin
// pages share with the student app. Imported after vidya/tokens.css so
// the custom-properties cascade resolves.
import "@alp/ui/ui.css";

import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
