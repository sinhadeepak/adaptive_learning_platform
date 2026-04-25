/// <reference types="vite/client" />

const apiBaseUrl: string = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export const env = {
  apiBaseUrl,
};
