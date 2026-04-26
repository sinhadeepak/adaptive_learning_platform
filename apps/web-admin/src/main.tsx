import React from "react";
import ReactDOM from "react-dom/client";

// Shared design system + admin-portal accent (red) per
// docs/ui/03_AdminPortal/00_admin-tokens.css.
import "@alp/design-system/tokens.css";
import "@alp/design-system/portals/admin.css";

import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
