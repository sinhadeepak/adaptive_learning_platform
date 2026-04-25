/// <reference types="vite/client" />

// Runtime config surface for web-student. Values from Vite's import.meta.env.

interface AlpEnv {
  readonly VITE_API_BASE_URL?: string;
}

const meta = import.meta as unknown as { env: AlpEnv };

export const env = {
  apiBaseUrl: meta.env.VITE_API_BASE_URL ?? "/api/v1",
};
