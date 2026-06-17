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

// Shared chrome stylesheets. Loaded globally at the entry point (not from a
// layout component) so the admin grid/table utilities in styles/shell.css and
// the form/button classes in design-system/shell.css stay available to every
// page regardless of which shell is mounted. Admin overrides come last.
import "@alp/design-system/shell.css";
import "./styles/shell.css";

import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
