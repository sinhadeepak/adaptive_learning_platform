// Sprint 18 (P3-S3) — Creator dashboard. Drives FSM through KYC stub
// and links to "My Courses".

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { type CreatorProfile, creator } from "../lib/api";

const STATUS_COPY: Record<CreatorProfile["applicationStatus"], string> = {
  APPLIED: "Application received. Next: complete identity verification.",
  KYC_PENDING:
    "Identity verification pending. Click below to simulate completion (stub).",
  KYC_VERIFIED: "Identity verified — awaiting platform-admin approval (~24h).",
  APPROVED: "Approved! Click 'Activate' to start publishing courses.",
  ACTIVE: "Live. You can author courses, submit them for review, and publish.",
  REJECTED: "Application not approved. Check email for details.",
  SUSPENDED: "Account temporarily suspended. Contact support.",
};

export function CreatorDashboard() {
  const nav = useNavigate();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    creator
      .me()
      .then((p) => {
        if (p === null) {
          nav("/creator/apply");
          return;
        }
        setProfile(p);
        setLoading(false);
      })
      .catch((e) => {
        setError((e as Error).message);
        setLoading(false);
      });
  }, [nav]);

  async function refresh() {
    setProfile(await creator.me());
  }

  async function startKyc() {
    setError(null);
    try {
      await creator.startKyc();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function pollKyc() {
    setError(null);
    try {
      await creator.pollKyc();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function activate() {
    setError(null);
    try {
      await creator.activate();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) {
    return (
      <AppShell title="Creator dashboard">
        <main className="page" style={{ padding: 24 }}>
          <p>Loading…</p>
        </main>
      </AppShell>
    );
  }
  if (!profile) return null;

  return (
    <AppShell title="Creator dashboard">
      <main className="page" style={{ padding: 24, maxWidth: 760 }}>
        <h1>{profile.displayName}</h1>
        <p style={{ color: "var(--ink-3)" }}>{profile.headline}</p>

        <section
          style={{
            padding: 16,
            border: "1px solid var(--rule)",
            borderRadius: 8,
            margin: "16px 0",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
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
            <button type="button" className="btn-primary" onClick={pollKyc}>
              Simulate verification complete (stub)
            </button>
          )}
          {profile.applicationStatus === "APPROVED" && (
            <button type="button" className="btn-primary" onClick={activate}>
              Activate — start publishing
            </button>
          )}
          {profile.applicationStatus === "ACTIVE" && (
            <Link to="/creator/courses">→ Manage my courses</Link>
          )}
        </section>
      </main>
    </AppShell>
  );
}