import React from "react";
import ReactDOM from "react-dom/client";

// Vidya v1 design tokens — supersedes Aurora v2 + per-portal accent files.
// Teacher persona/density set on <html> in apps/web-portal/index.html.
// Author routes (also served by this app) can switch persona at the route
// level by setting data-persona on a wrapping element.
import "@alp/design-system/vidya/tokens.css";
import "@alp/design-system/vidya/fonts.css";

import { App } from "./App";
import { ThemeProvider } from "./lib/theme";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
