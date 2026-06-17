// useViewport — tiny matchMedia hook for responsive layout splits.
//
// Used by Phase 6 S51 to switch the quiz player between desktop and
// mobile variants at the 640px breakpoint.

import { useEffect, useState } from "react";

const MOBILE_QUERY = "(max-width: 639.9px)";

export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(MOBILE_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
