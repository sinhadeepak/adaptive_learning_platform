import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

// Browser DOM + fetch + storage globals consumed by app code.
const browserGlobals = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  location: "readonly",
  console: "readonly",
  fetch: "readonly",
  Response: "readonly",
  Request: "readonly",
  RequestInfo: "readonly",
  Headers: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Blob: "readonly",
  FormData: "readonly",
  AbortController: "readonly",
  AbortSignal: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  alert: "readonly",
  confirm: "readonly",
  prompt: "readonly",
  HTMLElement: "readonly",
  HTMLInputElement: "readonly",
  HTMLTextAreaElement: "readonly",
  HTMLSelectElement: "readonly",
  HTMLDetailsElement: "readonly",
  HTMLAnchorElement: "readonly",
  HTMLFormElement: "readonly",
  Event: "readonly",
  CustomEvent: "readonly",
  KeyboardEvent: "readonly",
  MouseEvent: "readonly",
  // React UMD-style namespace usages (e.g. React.CSSProperties type cast).
  React: "readonly",
};

// Vitest globals — only injected for test files (see overrides below).
const vitestGlobals = {
  test: "readonly",
  expect: "readonly",
  describe: "readonly",
  it: "readonly",
  beforeEach: "readonly",
  afterEach: "readonly",
  beforeAll: "readonly",
  afterAll: "readonly",
  vi: "readonly",
};

export default [
  { ignores: ["dist", "node_modules", "coverage"] },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: browserGlobals,
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Fast Refresh is dev-only; co-locating a hook with its Provider
      // (the React idiom for `auth-provider.tsx`) is fine.
      "react-refresh/only-export-components": "off",
      // Defer to TS-aware unused-vars: it understands type-signature args
      // (`(email: string) => …` in an interface) and type-only imports.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { args: "after-used", argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // TS's type-vs-value namespacing makes the base rule too strict
      // (e.g. `type Language = "en"` and `function Language() {}` coexist).
      "no-redeclare": "off",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "**/test-setup.ts"],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...browserGlobals, ...vitestGlobals },
    },
  },
];
