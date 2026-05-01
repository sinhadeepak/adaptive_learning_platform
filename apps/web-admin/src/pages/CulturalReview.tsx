import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/primitives";

// ─────────────────────────────────────────────────────────────────────────
// CE-404 — cultural review queue.
//
// Cultural reviewers handle translations flagged for politically /
// religiously / regionally sensitive content. SLA is 5 working days
// (vs 1 day for general translation review).
//
// v1 surface: this page provides the reviewer's queue view + scoped
// review actions. Backend cultural-flag column lives on
// content_artifact_translations.cultural_flags JSONB (deferred from
// S43 — flagged items currently surface only on the in-memory
// TranslationDraft); the page handles both today (manual artifact ID
// lookup) and post-migration (queue-driven).
// ─────────────────────────────────────────────────────────────────────────

export function CulturalReview() {
  const [showRationale, setShowRationale] = useState(true);

  return (
    <AppShell
      title="Cultural Review Queue"
      chips={[{ label: "Phase 5" }, { label: "Senior reviewer" }]}
    >
      <Banner tone="info">
        <strong>5-day SLA</strong> · Cultural reviewers handle translations
        flagged for politically / religiously / regionally sensitive content.
        Approve, suggest substitution, or revert to source language.
      </Banner>

      {showRationale && (
        <section
          style={{
            padding: 16,
            marginTop: 16,
            background: "var(--bg-subtle, #f8f9fc)",
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <strong>About cultural review</strong>
            <button
              onClick={() => setShowRationale(false)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Dismiss
            </button>
          </div>
          <p>
            AI flags translations whose source content references politicians,
            religious figures, region-specific examples, or contested
            historical narratives. The cultural reviewer decides whether the
            target-language rendering preserves intent without giving offence
            in the target region.
          </p>
          <p style={{ marginTop: 8 }}>
            Three actions: (1) <strong>Approve</strong> as-is. (2){" "}
            <strong>Suggest substitution</strong> — propose a culturally-
            appropriate alternative phrasing. (3) <strong>Don't localise</strong>{" "}
            — keep the source-language form (with a banner shown to students).
          </p>
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <Banner tone="warning">
          <strong>Queue sourcing follow-up:</strong> The cultural-flags JSONB
          column is on the deferred list from S43. Until it lands, reviewers
          enter the artifact ID manually below; the translator's in-memory
          flag list surfaces in the audit log.
        </Banner>

        <div style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Manual lookup</h2>
          <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
            Use the Translation Review page to load a flagged artifact, then
            select the affected language. Cultural-only actions (substitute,
            revert) land alongside the queue-driven UI in a follow-up sprint.
          </p>
          <a
            href="/translation-review"
            style={{
              display: "inline-block",
              padding: "8px 16px",
              background: "var(--color-blue, #4f87f6)",
              color: "white",
              borderRadius: 4,
              textDecoration: "none",
              fontSize: 13,
            }}
          >
            Open Translation Review →
          </a>
        </div>

        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>SLA tracking</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
            }}
          >
            <div
              style={{
                padding: 12,
                border: "1px solid var(--border, #e1e5ee)",
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase" }}>
                Pending review
              </div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>—</div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>queue endpoint pending</div>
            </div>
            <div
              style={{
                padding: 12,
                border: "1px solid var(--border, #e1e5ee)",
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase" }}>
                Within SLA
              </div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>—</div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>&lt; 5 working days</div>
            </div>
            <div
              style={{
                padding: 12,
                border: "1px solid var(--border, #e1e5ee)",
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase" }}>
                SLA breach
              </div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>—</div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>&gt; 5 working days</div>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
