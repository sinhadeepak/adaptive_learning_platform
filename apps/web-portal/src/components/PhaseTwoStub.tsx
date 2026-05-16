import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "./AppShell";

// ─────────────────────────────────────────────────────────────────────────
// PhaseTwoStub — shared shell for "this service lands in Phase 2" pages.
// Production-grade redesign (2026-05-11): uses pg-* primitives + a richer
// 4-card capability grid + a softer "preview" notice. Same data model
// (CapabilityCard, etc.) so call sites don't need to change.
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
      <div className="pg-shell">
        {/* Hero — same gradient look as the rest of the portal, but with
            a 'preview' chip up top so it doesn't pretend to be functional. */}
        <section className="ai-header" aria-label={topbarTitle} style={{ marginBottom: 22 }}>
          <div className="ai-header-left">
            <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <span className="ai-pill">{pillLabel}</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 9px",
                  background: "rgba(245,166,35,0.12)",
                  border: "1px solid rgba(245,166,35,0.30)",
                  color: "var(--warn)",
                  borderRadius: 20,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                ⏳ Preview · lands in Phase 2
              </span>
            </div>
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

        {/* Capability cards — richer than the dashed topic-stat tiles.
            Each card is its own little pg-section so it lifts cleanly
            on both themes. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(capabilities.length, 4)}, minmax(0, 1fr))`,
            gap: 14,
            marginBottom: 22,
          }}
          aria-label="What you'll do here"
        >
          {capabilities.map((c) => (
            <div
              key={c.title}
              className="pg-section"
              style={{ margin: 0, padding: "18px 18px 16px" }}
            >
              <div style={{ fontSize: 22, marginBottom: 8 }}>{c.icon}</div>
              <h3
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: "var(--ink-4)",
                  margin: "0 0 6px",
                }}
              >
                {c.title}
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--ink-2)",
                  lineHeight: 1.55,
                  margin: 0,
                }}
              >
                {c.body}
              </p>
            </div>
          ))}
        </div>

        {/* Service note — soft amber banner instead of the dashed empty-state */}
        <section
          style={{
            background: "linear-gradient(135deg, rgba(245,166,35,0.06), rgba(245,166,35,0.02))",
            border: "1px solid rgba(245,166,35,0.25)",
            borderRadius: 10,
            padding: "16px 20px",
            display: "flex",
            gap: 16,
            alignItems: "flex-start",
          }}
        >
          <div style={{ fontSize: 22, lineHeight: 1 }}>📦</div>
          <div style={{ flex: 1 }}>
            <h3
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--warn)",
                margin: "0 0 6px",
                letterSpacing: 0.2,
              }}
            >
              Backend in flight
            </h3>
            <p
              style={{
                fontSize: 13,
                color: "var(--ink)",
                lineHeight: 1.55,
                margin: "0 0 6px",
              }}
            >
              {serviceNote}
            </p>
            <p style={{ fontSize: 11, color: "var(--ink-3)", margin: 0, lineHeight: 1.5 }}>
              See <code>docs/02_planning/19_Phase2_SprintDevelopmentPlan.md</code>{" "}
              for the rollout plan. Until then, every action on this surface
              is a no-op stub — the navigation entry is live so deep-links
              work once the service comes online.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}