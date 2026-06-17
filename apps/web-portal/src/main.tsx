import React from "react";
import ReactDOM from "react-dom/client";

// Vidya v1 design tokens — supersedes Aurora v2 + per-portal accent files.
// Teacher persona/density set on <html> in apps/web-portal/index.html.
// Author routes (also served by this app) can switch persona at the route
// level by setting data-persona on a wrapping element.
import "@alp/design-system/vidya/tokens.css";
import "@alp/design-system/vidya/density-scalars.css";
import "@alp/design-system/vidya/fonts.css";

// Shared component CSS — provides the vidya-shell chrome (sidebar /
// topbar / brand) plus pills, cards and form classes. Imported here
// (not just via AppShell) so the chrome matches the web-admin app.
import "@alp/ui/ui.css";

import { App } from "./App";
import { ThemeProvider } from "./lib/theme";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
