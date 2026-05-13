import React from "react";
import ReactDOM from "react-dom/client";

// Shared design system + teacher-portal accent (green) per
// docs/ui/04_TeacherPortal/00_teacher-tokens.css. Note the same web-portal
// app also serves the Content Author surface (for Sprint 3 MVP) — when
// authoring routes need the purple accent we can layer the author tokens
// on a per-route className.
import "@alp/design-system/tokens.css";
import "@alp/design-system/portals/teacher.css";

import { App } from "./App";
import { ThemeProvider } from "./lib/theme";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
