// Sprint 16 (P3-S1) — Tutor dashboard.
//
// Lands at /tutor after applying. Shows current application status,
// drives the KYC stub through to ACTIVE.
//
// P3-S2 will replace the stub button with the real Stripe Identity
// iframe + add booking views, calendar, earnings.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { type TutorProfile, marketplace } from "../lib/api";

const STATUS_COPY: Record<TutorProfile["applicationStatus"], string> = {
  APPLIED: "Application received. Next: complete identity verification.",
  KYC_PENDING:
    "Identity verification in progress. Polling Stripe Identity for the result.",
  KYC_VERIFIED:
    "Identity verified. Awaiting platform admin approval — usually within 24h.",
  APPROVED:
    "You're approved! Click 'Activate' below to start receiving bookings.",
  ACTIVE:
    "You're live on the marketplace. Students can now find and book sessions with you.",
  REJECTED:
    "Application not approved. See your email for details, or contact support.",
  SUSPENDED:
    "Account temporarily suspended. Reach out to support to reactivate.",
};

export function TutorDashboard() {
  const nav = useNavigate();
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    marketplace
      .getMyTutorProfile()
      .then((p) => {
        if (cancelled) return;
        if (p === null) {
          nav("/tutor/apply");
          return;
        }
        setProfile(p);
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError((e as Error).message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nav]);

  async function startKyc() {
    setError(null);
    try {
      await marketplace.startKyc();
      const updated = await marketplace.getMyTutorProfile();
      setProfile(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function pollKyc(force?: "rejected") {
    setError(null);
    try {
      await marketplace.pollKyc(force);
      const updated = await marketplace.getMyTutorProfile();
      setProfile(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function activate() {
    setError(null);
    try {
      await marketplace.activate();
      const updated = await marketplace.getMyTutorProfile();
      setProfile(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) {
    return (
      <AppShell title="Tutor dashboard">
        <main className="page" style={{ padding: 24 }}>
          <p>Loading…</p>
        </main>
      </AppShell>
    );
  }
  if (!profile) return null;

  return (
    <AppShell title="Tutor dashboard">
      <main className="page" style={{ padding: 24, maxWidth: 760 }}>
        <h1>{profile.displayName}</h1>
        <p style={{ color: "var(--text-muted)" }}>{profile.headline}</p>

        <section
          style={{
            padding: 16,
            border: "1px solid var(--border-faint)",
            borderRadius: 8,
            margin: "16px 0",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Application status
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
            {profile.applicationStatus}
          </div>
          <p style={{ marginTop: 8 }}>{STATUS_COPY[profile.applicationStatus]}</p>
        </section>

        {error && <p className="banner banner-error">{error}</p>}

        <section style={{ marginBottom: 16 }}>
          {profile.applicationStatus === "APPLIED" && (
            <button type="button" className="btn-primary" onClick={startKyc}>
              Start identity verification
            </button>
          )}
          {profile.applicationStatus === "KYC_PENDING" && (
            <>
              <button type="button" className="btn-primary" onClick={() => pollKyc()}>
                Simulate verification complete (stub)
              </button>{" "}
              <button type="button" onClick={() => pollKyc("rejected")}>
                Simulate verification rejected (stub)
              </button>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                P3-S2 replaces these with the real Stripe Identity iframe.
              </p>
            </>
          )}
          {profile.applicationStatus === "APPROVED" && (
            <button type="button" className="btn-primary" onClick={activate}>
              Activate — start receiving bookings
            </button>
          )}
          {profile.applicationStatus === "ACTIVE" && (
            <p>
              <Link to="/tutor/apply">Edit your profile</Link>
            </p>
          )}
        </section>

        <section>
          <h2>Profile</h2>
          <ul>
            <li>
              <strong>Hourly rate:</strong> ₹
              {(profile.hourlyRatePaise / 100).toLocaleString()}
            </li>
            <li>
              <strong>Topics taught:</strong> {profile.topicIds.length}
            </li>
            <li>
              <strong>Availability windows:</strong> {profile.availability.length}
            </li>
            <li>
              <strong>Qualifications:</strong> {profile.qualifications.length}
            </li>
          </ul>
        </section>
      </main>
    </AppShell>
  );
}
