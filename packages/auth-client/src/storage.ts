import type { Tokens } from "./types";

export interface TokenStorage {
  get(): Tokens | null;
  set(tokens: Tokens): void;
  clear(): void;
}

const KEY = "alp.auth.tokens";

export const localStorageTokenStorage: TokenStorage = {
  get() {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  },
  set(tokens) {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(KEY, JSON.stringify(tokens));
    }
  },
  clear() {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(KEY);
    }
  },
};

export function createMemoryTokenStorage(): TokenStorage {
  let current: Tokens | null = null;
  return {
    get: () => current,
    set: (t) => {
      current = t;
    },
    clear: () => {
      current = null;
    },
  };
}
