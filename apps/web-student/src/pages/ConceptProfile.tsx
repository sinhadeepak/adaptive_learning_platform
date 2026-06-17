// ConceptProfile — Vidya v1 redesign.
//
// Per-concept analytics drill-down: mastery, recent attempts, related
// concepts. Layout: VidyaShell (crumbs + title + subtitle + back action)
// → concept list rail + selected-concept radar/bloom matrix/cross-links.
//
// Per ADR-0017: 9-dimension assessment substrate per concept. v1
// surfaces the dimensions the backend already serves end-to-end:
//   1. Concept mastery (per-concept EWA)
//   2. Bloom-level depth (per-(concept, bloom) EWA)
//   3. Fluency (actual / expected ms)
//   4. Confidence calibration (Brier across history)
//   5. Transfer ability (multi-tag vs single-tag accuracy delta)
//
// The remaining dimensions (accuracy patterns / retention /
// procedural skill / strategic test-taking) come from existing
// endpoints (S29 error-patterns, S27 revision queue, S22 sections);
// the radar surfaces concept-grain only here, and links to the
// corresponding pages for the rest.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { VidyaShell } from "../components/vidya/VidyaShell";
import { RadarChart, type RadarPoint } from "../components/RadarChart";
import { useAuth } from "../lib/auth-provider";
import {
  studentProfile,
  type MultiProfileResponse,
  type TransferRow,
} from "../lib/phase5-api";

function bloomMatrixRow(matrix: MultiProfileResponse["bloomMatrix"], conceptId: string): {
  level: string;
  ewa: number | null;
}[] {
  const cell = matrix[conceptId] ?? {};
  const levels = ["REMEMBER", "UNDERSTAND", "APPLY", "ANALYSE", "EVALUATE", "CREATE"];
  return levels.map((level) => ({
    level,
    ewa: cell[level]?.ewa ?? null,
  }));
}

export function ConceptProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<MultiProfileResponse | null>(null);
  const [transfer, setTransfer] = useState<TransferRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const p = await studentProfile.multiProfile(user.id);
        setProfile(p);
        if (p.concepts.length > 0) setSelectedConceptId(p.concepts[0].conceptId);
        const t = await studentProfile.transfer(user.id, 3);
        setTransfer(t.transfer);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load profile");
      }
    })();
  }, [user?.id]);

  const selectedConcept = useMemo(
    () => profile?.concepts.find((c) => c.conceptId === selectedConceptId) ?? null,
    [profile, selectedConceptId],
  );

  const radarPoints = useMemo<RadarPoint[]>(() => {
    if (!profile || !selectedConceptId) return [];

    const concept = profile.concepts.find((c) => c.conceptId === selectedConceptId);
    const masteryEwa = concept?.ewa ?? 0;

    const blooms = bloomMatrixRow(profile.bloomMatrix, selectedConceptId);
    const validBlooms = blooms.filter((b) => b.ewa !== null).map((b) => b.ewa as number);
    const bloomAvg =
      validBlooms.length > 0 ? validBlooms.reduce((a, b) => a + b, 0) / validBlooms.length : 0;

    const fluency = profile.fluency.find((f) => f.conceptId === selectedConceptId);
    // fluency_score in [0.1, 10.0]; map to [0, 1]: 1.0 = at-pace, < 1 slower.
    const fluencyNorm = fluency ? Math.max(0, Math.min(1, fluency.fluencyScore / 1.5)) : 0;

    // Brier score in [0, 1] where 0 = perfect calibration. Invert for the
    // radar (higher = better).
    const calibration = profile.confidenceBrier !== null
      ? Math.max(0, 1 - profile.confidenceBrier)
      : 0;

    const transferRow = transfer.find((t) => t.conceptId === selectedConceptId);
    // Map transfer score from [-1, 1] to [0, 1].
    const transferNorm = transferRow?.transferScore !== null && transferRow?.transferScore !== undefined
      ? Math.max(0, Math.min(1, (transferRow.transferScore + 1) / 2))
      : 0;

    return [
      { label: "Mastery", value: masteryEwa },
      { label: "Bloom depth", value: bloomAvg },
      { label: "Fluency", value: fluencyNorm },
      { label: "Calibration", value: calibration },
      { label: "Transfer", value: transferNorm },
    ];
  }, [profile, transfer, selectedConceptId]);

  const conceptLabel = selectedConcept
    ? `${selectedConcept.conceptId.slice(0, 8)}…`
    : "Concept";
  const crumbs = `LEARN · CONCEPT · ${conceptLabel.toUpperCase()}`;

  const subtitle = selectedConcept
    ? `Mastery ${(selectedConcept.ewa * 100).toFixed(0)}% · n=${selectedConcept.n}`
    : profile && profile.concepts.length === 0
      ? "No concept-grain data yet"
      : "Select a concept to drill in";

  const backAction = (
    <Link
      to="/analysis"
      className="vidya-shell__chip"
      style={{ textDecoration: "none" }}
    >
      ← Analysis
    </Link>
  );

  return (
    <VidyaShell
      crumbs={crumbs}
      title="Concept profile"
      subtitle={subtitle}
      actions={backAction}
    >
      {error && (
        <div
          role="alert"
          style={{
            background: "var(--bad)",
            color: "var(--paper)",
            padding: "var(--sp-3)",
            borderRadius: "var(--radius-2)",
            margin: "0 0 var(--sp-3) 0",
          }}
        >
          {error}
        </div>
      )}

      {profile && profile.concepts.length === 0 && (
        <p style={{ fontSize: 14, opacity: 0.8 }}>
          No concept-grain data yet. Take a quiz first — your profile populates
          as you submit responses.
        </p>
      )}

      {profile && profile.concepts.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 24 }}>
          <div>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>Your concepts</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {profile.concepts.slice(0, 20).map((c) => (
                <button
                  key={c.conceptId}
                  type="button"
                  onClick={() => setSelectedConceptId(c.conceptId)}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    background:
                      selectedConceptId === c.conceptId
                        ? "var(--info-soft, #dbeafe)"
                        : "transparent",
                    border: "1px solid var(--rule, #e1e5ee)",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.7 }}>
                    {c.conceptId.slice(0, 8)}…
                  </div>
                  <div>
                    Mastery {(c.ewa * 100).toFixed(0)}% · n={c.n}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            {selectedConceptId && (
              <>
                <section className="vidya-heat-card" style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, marginBottom: 8 }}>
                    Selected: <code>{selectedConceptId.slice(0, 16)}…</code>
                  </h3>
                  <RadarChart points={radarPoints} size={360} />
                </section>

                <section style={{ marginTop: 16 }}>
                  <h4 style={{ fontSize: 13, marginBottom: 6 }}>Bloom matrix</h4>
                  <table style={{ width: "100%", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Level</th>
                        <th style={{ textAlign: "right" }}>EWA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bloomMatrixRow(profile.bloomMatrix, selectedConceptId).map((b) => (
                        <tr key={b.level}>
                          <td>{b.level}</td>
                          <td style={{ textAlign: "right" }}>
                            {b.ewa === null
                              ? "—"
                              : `${(b.ewa * 100).toFixed(0)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section style={{ marginTop: 16 }}>
                  <h4 style={{ fontSize: 13, marginBottom: 6 }}>Other dimensions</h4>
                  <ul style={{ fontSize: 13, listStyle: "none", padding: 0 }}>
                    <li>
                      <a href="/analysis">Accuracy patterns →</a>
                    </li>
                    <li>
                      <a href="/revision">Retention queue →</a>
                    </li>
                    <li>
                      <a href="/mocks">Strategic test-taking →</a>
                    </li>
                  </ul>
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </VidyaShell>
  );
}
