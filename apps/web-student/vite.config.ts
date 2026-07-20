import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 35173,
    // The Docker stack's `alp-local-web-student-1` container fronts the
    // production-style nginx on 35173 and proxies /api/v1/* + /ws/* to
    // the appropriate backend services. When this Vite dev server takes
    // 35173 it owns those routes natively; when it falls back to 35176
    // (because Docker has 35173), we proxy through to the nginx so that
    // /api calls keep working without code changes in the SPA.
    proxy: {
      "/api": { target: "http://localhost:35173", changeOrigin: false },
      "/ws":  { target: "http://localhost:35173", ws: true, changeOrigin: false },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    fakeTimers: {
      shouldAdvanceTime: true,
    },
  },
});
