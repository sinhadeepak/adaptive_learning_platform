/**
 * UX-34 instrumentation — Phase 6 S49.
 *
 * Lightweight client SDK for emitting UX events to
 * `/api/v1/analytics/ux-events`. Events are batched in memory and
 * flushed on a 4-second timer or on visibility-change. Failures
 * are silent — telemetry must NEVER break the page.
 *
 * Event names follow the `domain.action` convention (snake_case).
 * The server enforces an allow-list — adding a new name needs a
 * matching entry in `services/engagement/src/engagement/analytics/ux_events.py`.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { auth } from "./api";
import { env } from "./env";

interface UxEvent {
  event_name: string;
  properties?: Record<string, unknown>;
  session_id?: string;
  route?: string;
  variant?: string;
  network_kind?: string;
}

const FLUSH_DELAY_MS = 4000;
const MAX_BATCH = 50;
const _BUFFER: UxEvent[] = [];
let _flushTimer: number | null = null;

function networkKind(): string | undefined {
  // navigator.connection is non-standard but widely supported on mobile
  // in Chrome/Edge; falls back to undefined elsewhere.
  const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
  return conn?.effectiveType;
}

export function track(
  event_name: string,
  properties?: Record<string, unknown>,
  options?: { session_id?: string; variant?: string },
): void {
  _BUFFER.push({
    event_name,
    properties,
    session_id: options?.session_id,
    variant: options?.variant,
    route: typeof window !== "undefined" ? window.location.pathname : undefined,
    network_kind: networkKind(),
  });
  if (_BUFFER.length >= MAX_BATCH) {
    void flush();
    return;
  }
  scheduleFlush();
}

function scheduleFlush(): void {
  if (_flushTimer !== null) return;
  _flushTimer = window.setTimeout(() => {
    _flushTimer = null;
    void flush();
  }, FLUSH_DELAY_MS);
}

async function flush(): Promise<void> {
  if (_BUFFER.length === 0) return;
  const batch = _BUFFER.splice(0);
  try {
    // Use auth.fetch where possible (carries Bearer token); fall back
    // to plain fetch for anonymous screening events on the public
    // surface. The /analytics/ux-events route is auth-optional — guest
    // screening events ship without a token + an explicit user_id=null.
    const url = `${env.apiBaseUrl}/analytics/ux-events`;
    const body = JSON.stringify({ events: batch });
    const headers = { "content-type": "application/json" };
    if (auth.isAuthenticated && auth.isAuthenticated()) {
      await auth.fetch(url, { method: "POST", headers, body });
    } else {
      await fetch(url, { method: "POST", headers, body });
    }
  } catch {
    /* silent — never break the page */
  }
}

// Flush before tab close / visibility change (best-effort)
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });
  window.addEventListener("beforeunload", () => {
    if (_BUFFER.length === 0) return;
    // Use sendBeacon for reliability on unload (best-effort)
    try {
      const url = `${env.apiBaseUrl}/analytics/ux-events`;
      const body = JSON.stringify({ events: _BUFFER.splice(0) });
      navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }));
    } catch {
      /* swallow */
    }
  });
}

/**
 * Hook to auto-track page views. Drop in once at the App level or
 * per-page; either works (the dedupe is on event_name + route).
 */
export function useTrackPage(): void {
  const location = useLocation();
  useEffect(() => {
    track("page.viewed", { path: location.pathname });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
}
