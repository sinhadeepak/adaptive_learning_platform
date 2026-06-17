// Theme context — light / dark / system.
//
// The user's choice is persisted in localStorage under `alp.theme`.
// On boot, a tiny inline script in index.html reads the same key and
// applies the resolved theme to <html data-theme="…"> *before* React
// mounts, so there's no dark→light flash on page load. This module
// keeps the React state in sync with that attribute and listens to the
// OS-level prefers-color-scheme change event when mode is "system".

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "alp.theme";

function resolveSystem(): "light" | "dark" {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const effective = t === "system" ? resolveSystem() : t;
  document.documentElement.setAttribute("data-theme", effective);
  document.documentElement.style.colorScheme = effective;
}

function readStored(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
  } catch {
    /* localStorage blocked — fall through */
  }
  return "system";
}

interface ThemeCtx {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStored());
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    readStored() === "system" ? resolveSystem() : (readStored() as "light" | "dark"),
  );

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
    applyTheme(t);
    setResolved(t === "system" ? resolveSystem() : t);
  }, []);

  // Listen to OS-level changes when mode is "system".
  useEffect(() => {
    if (theme !== "system") return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const eff = resolveSystem();
      applyTheme("system");
      setResolved(eff);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  // Sync once on mount in case the inline boot script and React state
  // disagree (e.g. user just cleared localStorage).
  useEffect(() => {
    applyTheme(theme);
    setResolved(theme === "system" ? resolveSystem() : theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme called outside ThemeProvider");
  return c;
}
