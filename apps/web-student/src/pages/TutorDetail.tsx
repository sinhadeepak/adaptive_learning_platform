// Sprint 17 (P3-S2) — Tutor public profile + booking flow.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import {
  type AvailabilitySlot,
  type TutorPublicProfile,
  marketplace,
} from "../lib/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function paiseToRupees(p: number): string {
  return `₹${(p / 100).toLocaleString("en-IN")}`;
}

function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function TutorDetail() {
  const { userId } = useParams<{ userId: string }>();
  const nav = useNavigate();
  const [profile, setProfile] = useState<TutorPublicProfile | null>(null);
  const [date, setDate] = useState(todayISO(1));
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    if (!userId) return;
    marketplace
      .getTutor(userId)
      .then(setProfile)
      .catch((e) => setError((e as Error).message));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    marketplace
      .availability(userId, date)
      .then((d) => setSlots(d.slots))
      .catch(() => setSlots([]));
  }, [userId, date]);

  async function bookSlot(slot: AvailabilitySlot) {
    if (!userId) return;
    if (!confirm(`Book this slot? You'll be charged ${paiseToRupees(profile!.hourlyRatePaise)}.`)) return;
    setBooking(true);
    setError(null);
    try {
      const b = await marketplace.createBooking({
        tutorUserId: userId,
        slotStart: slot.slotStart,
        // Default 1-hour session — fits inside the slot. Real slot-picker
        // (60/90/120 min) is a P3-S3 polish item.
        slotEnd: new Date(
          new Date(slot.slotStart).getTime() + 60 * 60 * 1000,
        ).toISOString(),
      });
      // Stub-mode payment: confirm immediately. Real Stripe SDK flow
      // lands in P3-S2-late (per ADR-0007).
      await marketplace.confirmPayment(b.id);
      nav("/bookings");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBooking(false);
    }
  }

  if (!profile) {
    return (
      <AppShell title="Tutor">
        <div style={{ padding: "16px 24px" }}>
          {error ? <p className="banner banner-error">{error}</p> : <p style={{ color: "var(--ink-3)" }}>Loading…</p>}
          <Link to="/tutors" style={{ color: "var(--info)" }}>← Back to tutors</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={profile.displayName}>
    <div style={{ padding: "16px 24px 32px", maxWidth: 880 }}>
      <Link to="/tutors" style={{ color: "var(--info)", fontSize: 13 }}>← Back to tutors</Link>
      <h1>{profile.displayName}</h1>
      <p style={{ color: "var(--ink-3)" }}>{profile.headline}</p>
      <p style={{ fontSize: 18 }}>
        <strong>{paiseToRupees(profile.hourlyRatePaise)}</strong>/hr
      </p>

      {profile.bio && (
        <section style={{ margin: "16px 0" }}>
          <h2>About</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{profile.bio}</p>
        </section>
      )}

      {profile.qualifications.length > 0 && (
        <section style={{ margin: "16px 0" }}>
          <h2>Qualifications</h2>
          <ul>
            {profile.qualifications.map((q) => (
              <li key={q.id}>
                <strong>{q.title}</strong>
                {q.institution && <> — {q.institution}</>}
                {q.yearCompleted && <> ({q.yearCompleted})</>}
                <span style={{ color: "var(--ink-3)", marginLeft: 8 }}>
                  [{q.kind}]
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile.availability.length > 0 && (
        <section style={{ margin: "16px 0" }}>
          <h2>Weekly availability</h2>
          <ul>
            {profile.availability.map((a) => {
              const sh = String(Math.floor(a.startMinute / 60)).padStart(2, "0");
              const sm = String(a.startMinute % 60).padStart(2, "0");
              const eh = String(Math.floor(a.endMinute / 60)).padStart(2, "0");
              const em = String(a.endMinute % 60).padStart(2, "0");
              return (
                <li key={a.id}>
                  {DAYS[a.dayOfWeek]} {sh}:{sm}–{eh}:{em}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section style={{ margin: "16px 0" }}>
        <h2>Book a session</h2>
        <label>
          Date{" "}
          <input
            type="date"
            value={date}
            min={todayISO(0)}
            max={todayISO(14)}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {error && <p className="banner banner-error">{error}</p>}
        <div style={{ marginTop: 8 }}>
          {slots.length === 0 ? (
            <p>No open slots on {date}.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {slots.map((s) => (
                <li key={s.slotStart} style={{ marginBottom: 6 }}>
                  <button
                    type="button"
                    disabled={booking}
                    onClick={() => bookSlot(s)}
                  >
                    {new Date(s.slotStart).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    →{" "}
                    {new Date(s.slotEnd).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
    </AppShell>
  );
}