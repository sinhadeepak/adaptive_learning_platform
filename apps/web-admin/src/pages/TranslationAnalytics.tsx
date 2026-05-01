import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { Banner, Pill } from "../components/primitives";
import {
  translationAnalytics,
  type TranslationAnalyticsResponse,
} from "../lib/phase5-api";

// ─────────────────────────────────────────────────────────────────────────
// CE-405 — translation analytics dashboard.
// Wraps GET /localisation/analytics (P5-S48). Per-language quality
// metrics over a sliding 12-week window. Targets surfaced inline so
// the bar charts compare against the spec thresholds.
// ─────────────────────────────────────────────────────────────────────────

function pct(n: number | null): string {
  return n === null ? "—" : `${(n * 100).toFixed(1)}%`;
}

function hours(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}h`;
}

function targetTone(
  value: number | null,
  target: number,
  higherIsBetter: boolean = true,
): "muted" | "danger" | "warning" | "success" {
  if (value === null) return "muted";
  if (higherIsBetter) {
    if (value >= target) return "success";
    if (value >= target * 0.8) return "warning";
    return "danger";
  }
  if (value <= target) return "success";
  if (value <= target * 1.2) return "warning";
  return "danger";
}

export function TranslationAnalytics() {
  const [data, setData] = useState<TranslationAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weeks, setWeeks] = useState(12);

  useEffect(() => {
    (async () => {
      try {
        setData(await translationAnalytics.fetch(weeks));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load");
      }
    })();
  }, [weeks]);

  return (
    <AppShell
      title="Translation Analytics"
      chips={[{ label: "Phase 5" }, { label: "Operations" }]}
    >
      {error && <Banner tone="danger">{error}</Banner>}

      <section style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13 }}>
          Window:{" "}
          <select
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            style={{ padding: 4, borderRadius: 4 }}
          >
            <option value={4}>4 weeks</option>
            <option value={12}>12 weeks</option>
            <option value={26}>26 weeks</option>
            <option value={52}>52 weeks</option>
          </select>
        </label>
      </section>

      {data && (
        <>
          <section
            style={{
              padding: 12,
              marginBottom: 16,
              background: "var(--bg-subtle, #f8f9fc)",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <strong>Targets:</strong> acceptance rate &gt;{" "}
            {pct(data.targets.acceptanceRateTarget)} · re-translation &lt;{" "}
            {pct(data.targets.retranslationRateCeiling)} · lead time p95 &lt;{" "}
            {data.targets.leadTimeP95HoursTarget}h
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>Per-language quality</h2>
            {data.perLanguage.length === 0 ? (
              <Banner tone="info">
                No translations in the last {weeks} weeks. Pipeline is ready;
                content team queues jobs as they go.
              </Banner>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border, #e1e5ee)" }}>
                    <th style={{ textAlign: "left", padding: 8 }}>Language</th>
                    <th style={{ textAlign: "right", padding: 8 }}>Total</th>
                    <th style={{ textAlign: "right", padding: 8 }}>Published</th>
                    <th style={{ textAlign: "right", padding: 8 }}>Draft</th>
                    <th style={{ textAlign: "right", padding: 8 }}>In review</th>
                    <th style={{ textAlign: "right", padding: 8 }}>AI conf</th>
                    <th style={{ textAlign: "right", padding: 8 }}>Acceptance</th>
                    <th style={{ textAlign: "right", padding: 8 }}>Re-translation</th>
                    <th style={{ textAlign: "right", padding: 8 }}>p50</th>
                    <th style={{ textAlign: "right", padding: 8 }}>p95</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perLanguage.map((row) => (
                    <tr
                      key={row.language}
                      style={{ borderBottom: "1px solid var(--border-subtle, #f0f2f6)" }}
                    >
                      <td style={{ padding: 8, fontWeight: 600 }}>
                        {row.language.toUpperCase()}
                      </td>
                      <td style={{ padding: 8, textAlign: "right" }}>
                        {row.translationsTotal}
                      </td>
                      <td style={{ padding: 8, textAlign: "right" }}>
                        {row.translationsPublished}
                      </td>
                      <td style={{ padding: 8, textAlign: "right" }}>
                        {row.translationsDraft}
                      </td>
                      <td style={{ padding: 8, textAlign: "right" }}>
                        {row.translationsInReview}
                      </td>
                      <td style={{ padding: 8, textAlign: "right" }}>
                        {row.avgAiConfidence !== null
                          ? row.avgAiConfidence.toFixed(2)
                          : "—"}
                      </td>
                      <td style={{ padding: 8, textAlign: "right" }}>
                        <Pill
                          tone={targetTone(
                            row.acceptanceRate,
                            data.targets.acceptanceRateTarget,
                            true,
                          )}
                        >
                          {pct(row.acceptanceRate)}
                        </Pill>
                      </td>
                      <td style={{ padding: 8, textAlign: "right" }}>
                        <Pill
                          tone={targetTone(
                            row.retranslationRate,
                            data.targets.retranslationRateCeiling,
                            false,
                          )}
                        >
                          {pct(row.retranslationRate)}
                        </Pill>
                      </td>
                      <td style={{ padding: 8, textAlign: "right" }}>
                        {hours(row.leadTimeP50Hours)}
                      </td>
                      <td style={{ padding: 8, textAlign: "right" }}>
                        <Pill
                          tone={targetTone(
                            row.leadTimeP95Hours,
                            data.targets.leadTimeP95HoursTarget,
                            false,
                          )}
                        >
                          {hours(row.leadTimeP95Hours)}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>Glossary growth</h2>
            {data.glossarySize.length === 0 ? (
              <Banner tone="info">
                No glossary entries yet. Content team curates terminology as
                translations expose new terms.
              </Banner>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border, #e1e5ee)" }}>
                    <th style={{ textAlign: "left", padding: 8 }}>Subject</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Source</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Target</th>
                    <th style={{ textAlign: "right", padding: 8 }}>Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {data.glossarySize.map((g) => (
                    <tr key={`${g.subject}-${g.sourceLang}-${g.targetLang}`}>
                      <td style={{ padding: 8 }}>{g.subject}</td>
                      <td style={{ padding: 8 }}>{g.sourceLang}</td>
                      <td style={{ padding: 8 }}>{g.targetLang}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>
                        {g.entryCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
