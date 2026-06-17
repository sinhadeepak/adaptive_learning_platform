// Sprint 16 (P3-S1) — Tutor dashboard.
// Production-grade redesign (2026-05-11): pg-shell layout, status pill
// in header, KPI strip for profile basics, action panel with clear
// state-machine buttons.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { StatCard, SectionHeader } from "../components/primitives";
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

const STATUS_TONE: Record<
  TutorProfile["applicationStatus"],
  "muted" | "info" | "warn" | "success" | "danger"
> = {
  APPLIED: "info",
  KYC_PENDING: "warn",
  KYC_VERIFIED: "info",
  APPROVED: "warn",
  ACTIVE: "success",
  REJECTED: "danger",
  SUSPENDED: "danger",
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
        <div className="pg-shell">
          <section className="dash-section">
            <div className="stat-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <StatCard key={i} label="Loading" value="…" />
              ))}
            </div>
          </section>
        </div>
      </AppShell>
    );
  }
  if (!profile) return null;

  const status = profile.applicationStatus;
  const isActive = status === "ACTIVE";

  return (
    <AppShell title="Tutor dashboard">
      <div className="pg-shell">
        <header className="pg-header">
          <div className="pg-header-main">
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span className={`pg-pill pg-pill-${STATUS_TONE[status]}`}>
                {status.replace(/_/g, " ")}
              </span>
            </div>
            <h1 className="pg-header-title">{profile.displayName}</h1>
            <p className="pg-header-sub">
              {profile.headline || "Tutor on AdaptiveLearn."}
            </p>
          </div>
          <div className="pg-header-actions">
            {isActive && (
              <Link to="/tutor/apply" className="pg-btn pg-btn-ghost">
                Edit profile
              </Link>
            )}
          </div>
        </header>

        {/* KPI strip — profile basics */}
        <section className="dash-section">
          <SectionHeader label="Profile basics" />
          <div className="stat-grid">
            <StatCard
              label="Hourly rate"
              value={`₹${(profile.hourlyRatePaise / 100).toLocaleString("en-IN")}`}
              tone="success"
              hint="per session hour"
            />
            <StatCard
              label="Topics taught"
              value={profile.topicIds.length}
              hint={profile.topicIds.length === 0 ? "none yet" : "subject expertise"}
            />
            <StatCard
              label="Availability windows"
              value={profile.availability.length}
              hint="weekly slots"
            />
            <StatCard
              label="Qualifications"
              value={profile.qualifications.length}
              hint="verified credentials"
            />
          </div>
        </section>

        {/* Application-state panel */}
        <section className="dash-section">
          <SectionHeader label="Application status" count={status.replace(/_/g, " ")} />
          <p
            style={{
              fontSize: 13,
              color: "var(--ink-2)",
              lineHeight: 1.6,
              margin: "0 0 14px",
            }}
          >
            {STATUS_COPY[status]}
          </p>

          {error && <p className="banner banner-error">{error}</p>}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {status === "APPLIED" && (
              <button type="button" className="pg-btn pg-btn-primary" onClick={startKyc}>
                Start identity verification →
              </button>
            )}
            {status === "KYC_PENDING" && (
              <>
                <button
                  type="button"
                  className="pg-btn pg-btn-primary"
                  onClick={() => pollKyc()}
                >
                  Simulate verification complete (stub)
                </button>
                <button
                  type="button"
                  className="pg-btn pg-btn-ghost"
                  onClick={() => pollKyc("rejected")}
                >
                  Simulate rejection (stub)
                </button>
              </>
            )}
            {status === "APPROVED" && (
              <button type="button" className="pg-btn pg-btn-primary" onClick={activate}>
                ⚡ Activate — start receiving bookings
              </button>
            )}
            {status === "ACTIVE" && (
              <Link to="/tutor/apply" className="pg-btn pg-btn-ghost">
                Edit profile
              </Link>
            )}
          </div>
          {status === "KYC_PENDING" && (
            <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 10 }}>
              P3-S2 replaces these stub buttons with the real Stripe Identity iframe.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}