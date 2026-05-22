// TutorDetail — Vidya v1 redesign.
//
// Layout: VidyaShell (crumbs + tutor name + headline + back-to-tutors
// action) → hero rate card → About / Qualifications / Availability /
// Book-a-session vidya-card-block sections. Slot picker uses
// vidya-shell__chip pills.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { VidyaShell } from "../components/vidya/VidyaShell";
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
      <VidyaShell
        crumbs="MARKETPLACE · TUTOR"
        title="Tutor"
        subtitle="Loading profile…"
        actions={<Link to="/tutors" className="vidya-shell__chip">← Back to tutors</Link>}
      >
        <div style={{ maxWidth: 880 }}>
          {error ? (
            <div role="alert" style={{
              padding: "var(--sp-3) var(--sp-4)",
              background: "var(--bad)",
              color: "var(--paper)",
              borderRadius: 8,
              fontSize: 13,
            }}>
              {error}
            </div>
          ) : (
            <p style={{ color: "var(--ink-3)" }}>Loading…</p>
          )}
        </div>
      </VidyaShell>
    );
  }

  return (
    <VidyaShell
      crumbs={`MARKETPLACE · TUTOR · ${profile.displayName.toUpperCase()}`}
      title={profile.displayName}
      subtitle={profile.headline ?? "AdaptiveLearn tutor"}
      actions={<Link to="/tutors" className="vidya-shell__chip">← Back to tutors</Link>}
    >
      <div style={{ maxWidth: 880 }}>
        <section className="vidya-heat-card" style={{ marginBottom: "var(--sp-4)" }}>
          <div className="vidya-heat-card__head">
            <div>
              <div className="vidya-heat-card__eyebrow">HOURLY RATE</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--ink)" }}>
                {paiseToRupees(profile.hourlyRatePaise)}<span style={{ fontSize: 14, color: "var(--ink-3)" }}>/hr</span>
              </div>
            </div>
          </div>
        </section>

        {profile.bio && (
          <section className="vidya-card-block" style={{ marginBottom: "var(--sp-4)" }}>
            <div className="vidya-card-block__head">
              <h2 className="vidya-card-block__title">About</h2>
            </div>
            <p style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6 }}>
              {profile.bio}
            </p>
          </section>
        )}

        {profile.qualifications.length > 0 && (
          <section className="vidya-card-block" style={{ marginBottom: "var(--sp-4)" }}>
            <div className="vidya-card-block__head">
              <h2 className="vidya-card-block__title">Qualifications</h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              {profile.qualifications.map((q) => (
                <div key={q.id} style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  <strong style={{ color: "var(--ink)" }}>{q.title}</strong>
                  {q.institution && <> — {q.institution}</>}
                  {q.yearCompleted && <> ({q.yearCompleted})</>}
                  <span className="vidya-shell__chip" style={{ marginLeft: 8, fontSize: 10 }}>
                    {q.kind}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {profile.availability.length > 0 && (
          <section className="vidya-card-block" style={{ marginBottom: "var(--sp-4)" }}>
            <div className="vidya-card-block__head">
              <h2 className="vidya-card-block__title">Weekly availability</h2>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
              {profile.availability.map((a) => {
                const sh = String(Math.floor(a.startMinute / 60)).padStart(2, "0");
                const sm = String(a.startMinute % 60).padStart(2, "0");
                const eh = String(Math.floor(a.endMinute / 60)).padStart(2, "0");
                const em = String(a.endMinute % 60).padStart(2, "0");
                return (
                  <span key={a.id} className="vidya-shell__chip" style={{ fontSize: 12 }}>
                    {DAYS[a.dayOfWeek]} {sh}:{sm}–{eh}:{em}
                  </span>
                );
              })}
            </div>
          </section>
        )}

        <section className="vidya-card-block" style={{ marginBottom: "var(--sp-4)" }}>
          <div className="vidya-card-block__head">
            <h2 className="vidya-card-block__title">Book a session</h2>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-3)", fontSize: 13, color: "var(--ink-2)" }}>
            <span>Date</span>
            <input
              type="date"
              value={date}
              min={todayISO(0)}
              max={todayISO(14)}
              onChange={(e) => setDate(e.target.value)}
              style={{
                padding: "7px 10px",
                background: "var(--paper)",
                border: "1px solid var(--rule)",
                borderRadius: 8,
                color: "var(--ink)",
                fontSize: 13,
              }}
            />
          </label>
          {error && (
            <div role="alert" style={{
              padding: "var(--sp-3) var(--sp-4)",
              marginBottom: "var(--sp-3)",
              background: "var(--bad)",
              color: "var(--paper)",
              borderRadius: 8,
              fontSize: 13,
            }}>
              {error}
            </div>
          )}
          {slots.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0 }}>No open slots on {date}.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
              {slots.map((s) => (
                <button
                  key={s.slotStart}
                  type="button"
                  disabled={booking}
                  onClick={() => bookSlot(s)}
                  className="vidya-shell__chip"
                  style={{ fontSize: 13, padding: "8px 14px" }}
                >
                  {new Date(s.slotStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} →{" "}
                  {new Date(s.slotEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </VidyaShell>
  );
}
