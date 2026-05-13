// MyBookings — production-grade redesign (2026-05-11).
//
// Layout: pg-shell → pg-header → pg-tabs (Upcoming / Past / Cancelled)
// → pg-list of richer cards. Each card surfaces tutor name + avatar
// (fetched lazily from marketplace.getTutor), formatted slot time,
// duration, price, status, and a prominent "Join session" / "Cancel"
// action where appropriate.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { type Booking, marketplace } from "../lib/api";

interface TutorInfo {
  displayName: string;
}

function paiseToRupees(p: number): string {
  return `₹${(p / 100).toLocaleString("en-IN")}`;
}

function initialFor(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "T";
}

const AVATAR_TINTS = [
  "linear-gradient(135deg, #4F87F6, #22D4EE)",
  "linear-gradient(135deg, #A78BFA, #F472B6)",
  "linear-gradient(135deg, #10C47A, #22D4EE)",
  "linear-gradient(135deg, #FB923C, #F43F5E)",
];

function tintFor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

const STATUS_INFO: Record<
  Booking["status"],
  { label: string; tone: "success" | "info" | "warn" | "danger" | "muted" }
> = {
  PENDING_PAYMENT: { label: "Payment pending", tone: "warn" },
  CONFIRMED: { label: "Confirmed", tone: "info" },
  IN_PROGRESS: { label: "Live now", tone: "success" },
  COMPLETED: { label: "Completed", tone: "muted" },
  CANCELLED_BY_STUDENT: { label: "You cancelled", tone: "danger" },
  CANCELLED_BY_TUTOR: { label: "Tutor cancelled", tone: "danger" },
  NO_SHOW_STUDENT: { label: "You missed it", tone: "danger" },
  NO_SHOW_TUTOR: { label: "Tutor no-show", tone: "danger" },
};

function formatSlot(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
    time: d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
  };
}

function durationMinutes(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

function countdown(iso: string): string | null {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return null;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}

type Tab = "upcoming" | "past" | "cancelled";

const TAB_LABELS: Record<Tab, string> = {
  upcoming: "Upcoming",
  past: "Past",
  cancelled: "Cancelled",
};

function tabFor(b: Booking): Tab {
  if (b.status.startsWith("CANCELLED") || b.status.startsWith("NO_SHOW")) return "cancelled";
  if (b.status === "COMPLETED") return "past";
  return "upcoming";
}

export function MyBookings() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [tutors, setTutors] = useState<Record<string, TutorInfo>>({});
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("upcoming");

  function refresh() {
    setError(null);
    marketplace
      .myBookings()
      .then(setBookings)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(refresh, []);

  // Resolve tutor display names lazily — keeps the bookings list useful
  // without forcing the backend to embed the join.
  useEffect(() => {
    if (!bookings) return;
    const unknown = Array.from(new Set(bookings.map((b) => b.tutorUserId))).filter(
      (id) => !tutors[id],
    );
    if (unknown.length === 0) return;
    let alive = true;
    void (async () => {
      const next: Record<string, TutorInfo> = {};
      await Promise.all(
        unknown.map(async (id) => {
          try {
            const t = await marketplace.getTutor(id);
            next[id] = { displayName: t.displayName };
          } catch {
            next[id] = { displayName: "Tutor" };
          }
        }),
      );
      if (alive) setTutors((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      alive = false;
    };
  }, [bookings, tutors]);

  async function cancel(b: Booking) {
    if (
      !confirm(
        "Cancel this booking? Cancellations within 24h of the slot are not refundable.",
      )
    )
      return;
    try {
      await marketplace.cancel(b.id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const grouped = useMemo(() => {
    if (!bookings) return { upcoming: [], past: [], cancelled: [] };
    const out: Record<Tab, Booking[]> = { upcoming: [], past: [], cancelled: [] };
    for (const b of bookings) {
      out[tabFor(b)].push(b);
    }
    out.upcoming.sort(
      (a, b) => new Date(a.slotStart).getTime() - new Date(b.slotStart).getTime(),
    );
    out.past.sort(
      (a, b) => new Date(b.slotStart).getTime() - new Date(a.slotStart).getTime(),
    );
    out.cancelled.sort(
      (a, b) => new Date(b.slotStart).getTime() - new Date(a.slotStart).getTime(),
    );
    return out;
  }, [bookings]);

  const visible = grouped[tab];

  return (
    <AppShell title="My bookings">
      <div className="pg-shell">
        <header className="pg-header">
          <div className="pg-header-main">
            <h1 className="pg-header-title">My bookings</h1>
            <p className="pg-header-sub">
              Your scheduled 1:1 tutor sessions. Join live sessions directly
              from this page; cancellations up to 24h before the slot are
              fully refundable.
            </p>
          </div>
          <div className="pg-header-actions">
            <Link to="/tutors" className="pg-btn pg-btn-primary">
              ＋ Book a tutor
            </Link>
          </div>
        </header>

        <div className="pg-tabs" role="tablist">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`pg-tab${tab === t ? " on" : ""}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
              <span className="pg-tab-count">{grouped[t].length}</span>
            </button>
          ))}
        </div>

        {error && <p className="banner banner-error">{error}</p>}

        {bookings === null && !error && (
          <div className="pg-list">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="pg-row" style={{ opacity: 0.5, minHeight: 80 }} aria-hidden />
            ))}
          </div>
        )}

        {bookings !== null && visible.length === 0 && (
          <div className="pg-empty">
            <div className="pg-empty-icon">
              {tab === "upcoming" ? "📅" : tab === "past" ? "✓" : "✕"}
            </div>
            <h2 className="pg-empty-title">
              {tab === "upcoming"
                ? "No upcoming sessions"
                : tab === "past"
                  ? "No past sessions yet"
                  : "No cancellations"}
            </h2>
            <p className="pg-empty-body">
              {tab === "upcoming"
                ? "Book a tutor to start a 1:1 session. Slots are available across all subjects."
                : tab === "past"
                  ? "Your completed sessions will appear here for review."
                  : "Cancelled and no-show bookings will appear here."}
            </p>
            {tab === "upcoming" && (
              <Link to="/tutors" className="pg-btn pg-btn-primary">
                Browse tutors
              </Link>
            )}
          </div>
        )}

        {bookings !== null && visible.length > 0 && (
          <div className="pg-list">
            {visible.map((b) => {
              const slot = formatSlot(b.slotStart);
              const dur = durationMinutes(b.slotStart, b.slotEnd);
              const status = STATUS_INFO[b.status];
              const tutor = tutors[b.tutorUserId];
              const tutorName = tutor?.displayName ?? "Tutor";
              const cd = b.status === "CONFIRMED" || b.status === "PENDING_PAYMENT"
                ? countdown(b.slotStart)
                : null;
              const canJoin = b.status === "IN_PROGRESS" && b.dailyRoomUrl;
              const canCancel =
                b.status === "PENDING_PAYMENT" || b.status === "CONFIRMED";
              return (
                <div key={b.id} className="pg-row">
                  <div
                    className="pg-avatar pg-avatar-lg"
                    style={{ background: tintFor(b.tutorUserId) }}
                    aria-hidden
                  >
                    {initialFor(tutorName)}
                  </div>
                  <div className="pg-row-main">
                    <p className="pg-row-title">
                      {tutorName}
                      <span style={{ fontWeight: 500, color: "var(--text-muted)", marginLeft: 8 }}>
                        · {dur} min
                      </span>
                    </p>
                    <div className="pg-row-meta">
                      <span>📅 {slot.date}</span>
                      <span className="pg-row-meta-dot">·</span>
                      <span>🕒 {slot.time}</span>
                      <span className="pg-row-meta-dot">·</span>
                      <span>{paiseToRupees(b.pricePaise)}</span>
                      {cd && (
                        <>
                          <span className="pg-row-meta-dot">·</span>
                          <span style={{ color: "var(--color-blue)", fontWeight: 600 }}>
                            ⏱ {cd}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="pg-row-aside">
                    <span className={`pg-pill pg-pill-${status.tone}`}>
                      {status.label}
                    </span>
                    {canJoin && (
                      <a
                        href={b.dailyRoomUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pg-btn pg-btn-primary"
                      >
                        Join now →
                      </a>
                    )}
                    {canCancel && !canJoin && (
                      <button
                        type="button"
                        className="pg-btn pg-btn-ghost pg-btn-sm"
                        onClick={() => cancel(b)}
                      >
                        Cancel
                      </button>
                    )}
                    {b.status === "COMPLETED" && (
                      <Link
                        to={`/bookings/${b.id}/rate`}
                        className="pg-btn pg-btn-subtle pg-btn-sm"
                      >
                        Rate tutor
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
