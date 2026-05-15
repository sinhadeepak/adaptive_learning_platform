// Low-bandwidth preferences (Phase 6 S57, UX-32).
//
// Client-side toggle for users on flaky or expensive cellular.
// Three knobs:
//   - reducedAnimations: respect prefers-reduced-motion OR explicit opt-in
//   - prefetchOff: pages don't background-warm images / extra fetches
//   - imagesLite: render placeholders / low-DPR variants instead of
//                 full hero images
//
// All three are stored in localStorage so they persist between
// sessions. A future PR can wire them to <picture>, <Image>, and the
// SWR/fetch layer; for v0 we own the prefs surface and a runtime
// helper that callers consult.

const KEY = "ux32.low_bandwidth.v1";

export interface LowBandwidthPrefs {
  reducedAnimations: boolean;
  prefetchOff: boolean;
  imagesLite: boolean;
}

const DEFAULT_PREFS: LowBandwidthPrefs = {
  reducedAnimations: false,
  prefetchOff: false,
  imagesLite: false,
};

export function loadLowBandwidthPrefs(): LowBandwidthPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<LowBandwidthPrefs>;
    return {
      reducedAnimations: !!parsed.reducedAnimations,
      prefetchOff: !!parsed.prefetchOff,
      imagesLite: !!parsed.imagesLite,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveLowBandwidthPrefs(prefs: LowBandwidthPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* swallow — storage may be disabled */
  }
}

export function isLowBandwidthEnabled(): boolean {
  const p = loadLowBandwidthPrefs();
  return p.reducedAnimations || p.prefetchOff || p.imagesLite;
}

/** Respect the system reduced-motion preference automatically. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
