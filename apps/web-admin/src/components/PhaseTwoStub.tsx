import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "./AppShell";

// ─────────────────────────────────────────────────────────────────────────
// PhaseTwoStub — shared shell for "this service lands in Phase 2" pages.
// Used for nav items where the design language exists (per docs/ui READMEs)
// but the backend service hasn't landed yet. Renders a real, on-brand page
// instead of a "Coming soon" tooltip on a dimmed nav stub.
//
// Each stub page:
//   • AI-first gradient hero with portal pill + descriptive headline
//   • Sub-text naming the responsible service + Phase 2 timeline
//   • 2-3 "what you'll do here" cards previewing the capability
//   • Footer link strip pointing back to a wired page
// ─────────────────────────────────────────────────────────────────────────

export interface CapabilityCard {
  icon: string;
  title: string;
  body: string;
}

export interface PhaseTwoStubProps {
  topbarTitle: string;
  pillLabel: string;
  heroTitle: string;
  heroSubtitle: ReactNode;
  capabilities: CapabilityCard[];
  serviceNote: string;
  primaryCta?: { label: string; to: string };
  fallbackHref?: string;
  fallbackLabel?: string;
}

export function PhaseTwoStub({
  topbarTitle,
  pillLabel,
  heroTitle,
  heroSubtitle,
  capabilities,
  serviceNote,
  primaryCta,
  fallbackHref = "/dashboard",
  fallbackLabel = "← Dashboard",
}: PhaseTwoStubProps) {
  return (
    <AppShell title={topbarTitle}>
      <section className="ai-header" aria-label={topbarTitle}>
        <div className="ai-header-left">
          <span className="ai-pill">{pillLabel}</span>
          <h1 className="ai-header-name">{heroTitle}</h1>
          <p className="ai-header-sub">{heroSubtitle}</p>
          <div className="ai-header-btns">
            {primaryCta ? (
              <Link to={primaryCta.to} className="btn-ai">
                {primaryCta.label}
              </Link>
            ) : null}
            <Link to={fallbackHref} className="btn btn-ghost">
              {fallbackLabel}
            </Link>
          </div>
        </div>
      </section>

      <section
        className="topic-stats"
        style={{ marginTop: "var(--sp-4)" }}
        aria-label="What you'll do here"
      >
        {capabilities.map((c) => (
          <div key={c.title} className="topic-stat">
            <div
              className="topic-stat-num"
              style={{ fontSize: 22, color: "var(--info)" }}
            >
              {c.icon}
            </div>
            <div className="topic-stat-lbl">{c.title}</div>
            <div className="topic-stat-foot">{c.body}</div>
          </div>
        ))}
      </section>

      <section
        className="card empty-state"
        style={{ marginTop: "var(--sp-4)", padding: "var(--sp-5)" }}
      >
        <div className="empty-state-title">Lands in Phase 2</div>
        <p style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 6 }}>
          {serviceNote}
        </p>
        <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
          See <code>docs/02_planning/19_Phase2_SprintDevelopmentPlan.md</code> for the
          rollout plan. Until then, every action on this surface is a no-op
          stub — the navigation entry is live so deep-links work once the
          service comes online.
        </p>
      </section>
    </AppShell>
  );
}