// Density context — Junior / Aspirant / Pro.
//
// Mirrors the pattern of theme.tsx. The user's choice persists in
// localStorage under `alp.density`. A tiny inline script in index.html
// reads the same key and applies `data-density` to <html> BEFORE
// stylesheets paint, so the first paint matches the chosen density
// (otherwise spacing/type/radius scalars would jump on hydrate).
//
// Default at first ever boot is `aspirant`. Onboarding may suggest
// a different default per the user's exam profile (Junior for
// CBSE Class 5–8 + Vedic Maths; Pro for professional-course
// tracks) — that's a higher-level concern, this module is only
// responsible for persistence + runtime application.
//
// Spec: docs/02-design/design-system-v2-aurora.md §5

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Density = "junior" | "aspirant" | "pro";

const STORAGE_KEY = "alp.density";
const DEFAULT_DENSITY: Density = "aspirant";

function applyDensity(d: Density) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-density", d);
}

function readStored(): Density {
  if (typeof window === "undefined") return DEFAULT_DENSITY;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "junior" || saved === "aspirant" || saved === "pro") {
      return saved;
    }
  } catch {
    /* localStorage blocked — fall through */
  }
  return DEFAULT_DENSITY;
}

interface DensityCtx {
  density: Density;
  setDensity: (d: Density) => void;
}

const Ctx = createContext<DensityCtx | null>(null);

export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<Density>(() => readStored());

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    try {
      window.localStorage.setItem(STORAGE_KEY, d);
    } catch {
      /* ignore */
    }
    applyDensity(d);
  }, []);

  // Sync once on mount in case the inline boot script and React state
  // disagree (e.g. user just cleared localStorage in another tab).
  useEffect(() => {
    applyDensity(density);
  }, [density]);

  const value = useMemo(() => ({ density, setDensity }), [density, setDensity]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDensity(): DensityCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDensity called outside DensityProvider");
  return c;
}
