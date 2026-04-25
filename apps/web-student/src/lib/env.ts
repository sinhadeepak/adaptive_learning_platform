/// <reference types="vite/client" />

// Runtime config surface for web-student.
//
// IMPORTANT: Vite replaces `import.meta.env.VITE_*` only when accessed as a
// literal property chain at build time. Aliasing through `const meta = import.meta`
// silently breaks the replacement (the chain is no longer literal), so the
// production bundle fails at module-load with `Cannot read properties of
// undefined (reading 'VITE_API_BASE_URL')`. Always access import.meta.env
// directly here.

const apiBaseUrl: string = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export const env = {
  apiBaseUrl,
};
