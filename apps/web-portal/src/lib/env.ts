/// <reference types="vite/client" />

// Same constraint as web-student: access import.meta.env directly so Vite's
// build-time replacement actually fires.
const apiBaseUrl: string = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export const env = {
  apiBaseUrl,
};
