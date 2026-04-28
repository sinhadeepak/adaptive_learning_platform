// Sprint 17 (P3-S2) — Student's bookings list.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { type Booking, marketplace } from "../lib/api";

const STATUS_BADGE: Record<Booking["status"], { color: string; label: string }> = {
  PENDING_PAYMENT: { color: "#888", label: "Pending payment" },
  CONFIRMED: { color: "#4F87F6", label: "Confirmed" },
  IN_PROGRESS: { color: "#10C47A", label: "In progress" },
  COMPLETED: { color: "#888", label: "Completed" },
  CANCELLED_BY_STUDENT: { color: "#F43F5E", label: "Cancelled (you)" },
  CANCELLED_BY_TUTOR: { color: "#F43F5E", label: "Cancelled (tutor)" },
  NO_SHOW_STUDENT: { color: "#F43F5E", label: "No-show (you)" },
  NO_SHOW_TUTOR: { color: "#F43F5E", label: "No-show (tutor)" },
};

function paiseToRupees(p: number): string {
  return `₹${(p / 100).toLocaleString("en-IN")}`;
}

export function MyBookings() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setError(null);
    marketplace
      .myBookings()
      .then(setBookings)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(refresh, []);

  async function cancel(b: Booking) {
    if (!confirm("Cancel this booking? Cancellations within 24h of the slot are not allowed."))
      return;
    try {
      await marketplace.cancel(b.id);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <main className="page" style={{ padding: 24, maxWidth: 760 }}>
      <h1>My bookings</h1>
      <p>
        <Link to="/tutors">Find a tutor</Link>
      </p>

      {error && <p className="banner banner-error">{error}</p>}
      {bookings === null && !error && <p>Loading…</p>}
      {bookings !== null && bookings.length === 0 && <p>No bookings yet.</p>}

      {bookings !== null && bookings.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {bookings.map((b) => {
            const badge = STATUS_BADGE[b.status];
            return (
              <li
                key={b.id}
                style={{
                  padding: 16,
                  border: "1px solid var(--border-faint)",
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{new Date(b.slotStart).toLocaleString()}</strong>
                  <span
                    style={{
                      padding: "2px 8px",
                      background: badge.color,
                      color: "white",
                      fontSize: 11,
                      borderRadius: 4,
                    }}
                  >
                    {badge.label}
                  </span>
                </div>
                <p style={{ margin: "4px 0", color: "var(--text-muted)" }}>
                  Tutor: <code>{b.tutorUserId.slice(0, 8)}…</code> •{" "}
                  {paiseToRupees(b.pricePaise)} •{" "}
                  {Math.round(
                    (new Date(b.slotEnd).getTime() -
                      new Date(b.slotStart).getTime()) /
                      60000,
                  )}{" "}
                  min
                </p>
                {b.status === "IN_PROGRESS" && b.dailyRoomUrl && (
                  <a href={b.dailyRoomUrl} target="_blank" rel="noopener noreferrer">
                    Join session →
                  </a>
                )}
                {(b.status === "PENDING_PAYMENT" || b.status === "CONFIRMED") && (
                  <button
                    type="button"
                    style={{ marginTop: 4 }}
                    onClick={() => cancel(b)}
                  >
                    Cancel
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
