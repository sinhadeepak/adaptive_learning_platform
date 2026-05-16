import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../lib/auth-provider";
import {
  diagnostic,
  studentProfile,
  type RootCauseEdge,
  type RootCauseResponse,
} from "../lib/phase5-api";

// ─────────────────────────────────────────────────────────────────────────
// S46 — DiagnosticDeepDive.
//
// Visualises the root-cause walk per ADR-0017: a wrong answer is
// caused by weakness in the deepest-prerequisite concept whose mastery
// is below threshold. Surfaces the path concept-by-concept so the
// student knows which prerequisite to drill first.
//
// v1: caller provides the primary concept id + the prereq edges.
// (The page is currently linkable from the WeaknessDiagnosis page
// once it's upgraded to concept grain — for now it accepts manual
// entry so a student / coach can drill into any concept they've
// answered.)
// ─────────────────────────────────────────────────────────────────────────

export function DiagnosticDeepDive() {
  const { user } = useAuth();
  const [primaryConceptId, setPrimaryConceptId] = useState("");
  const [edgesRaw, setEdgesRaw] = useState("");
  const [result, setResult] = useState<RootCauseResponse | null>(null);
  const [masteryMap, setMasteryMap] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const profile = await studentProfile.multiProfile(user.id);
        const map: Record<string, number> = {};
        for (const c of profile.concepts) map[c.conceptId] = c.ewa;
        setMasteryMap(map);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load mastery map");
      }
    })();
  }, [user?.id]);

  function parseEdges(): RootCauseEdge[] {
    if (!edgesRaw.trim()) return [];
    return edgesRaw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [from, to] = line.split("->").map((s) => s.trim());
        return { fromConceptId: from, toConceptId: to };
      })
      .filter((e) => e.fromConceptId && e.toConceptId);
  }

  async function handleRun() {
    if (!primaryConceptId.trim()) {
      setError("Primary concept id required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const edges = parseEdges();
      const out = await diagnostic.rootCause(
        primaryConceptId,
        masteryMap,
        edges,
        0.4,
      );
      setResult(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Diagnostic failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Diagnostic deep dive">
      {error && (
        <div
          style={{
            padding: 8,
            background: "var(--bad-soft, #fee)",
            color: "var(--bad, #f43f5e)",
            borderRadius: 4,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      <section
        style={{
          padding: 16,
          background: "var(--paper-2, #f8f9fc)",
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <p style={{ fontSize: 13, opacity: 0.85, marginTop: 0 }}>
          Pick a concept you got wrong recently. Paste the prereq chain (one
          edge per line, "from -&gt; to"). The walker traces back to the
          deepest concept whose mastery is below 40% — that's the prereq to
          drill first.
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 4 }}>Primary concept id</div>
            <input
              value={primaryConceptId}
              onChange={(e) => setPrimaryConceptId(e.target.value)}
              placeholder="newton2"
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid var(--rule, #e1e5ee)",
                borderRadius: 4,
                fontSize: 13,
                fontFamily: "monospace",
              }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 4 }}>Prereq edges</div>
            <textarea
              value={edgesRaw}
              onChange={(e) => setEdgesRaw(e.target.value)}
              placeholder={`newton2 -> newton1\nnewton1 -> vectors`}
              rows={4}
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid var(--rule, #e1e5ee)",
                borderRadius: 4,
                fontSize: 13,
                fontFamily: "monospace",
              }}
            />
          </label>
          <button
            onClick={() => void handleRun()}
            disabled={busy || !primaryConceptId.trim()}
            style={{
              padding: "8px 16px",
              background:
                busy || !primaryConceptId.trim()
                  ? "var(--ink-4, #cbd5e0)"
                  : "var(--info, #4f87f6)",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor:
                busy || !primaryConceptId.trim() ? "not-allowed" : "pointer",
              alignSelf: "start",
              fontSize: 13,
            }}
          >
            {busy ? "Walking…" : "Walk prereq chain"}
          </button>
        </div>
      </section>

      {result && (
        <section>
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>Result</h3>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: result.rootCauseConceptId
                ? "var(--warn-soft, #fef3c7)"
                : "var(--good-soft, #d1fae5)",
              marginBottom: 12,
            }}
          >
            {result.rootCauseConceptId ? (
              <>
                <strong>Drill this first:</strong>{" "}
                <code>{result.rootCauseConceptId}</code>
                <p style={{ fontSize: 13, marginTop: 4, marginBottom: 0 }}>
                  Mastery on this prereq is below 40%. Strengthen it before
                  retrying questions on{" "}
                  <code>{result.primaryConceptId}</code>.
                </p>
              </>
            ) : (
              <>
                <strong>No deeper weak prereq found.</strong>
                <p style={{ fontSize: 13, marginTop: 4, marginBottom: 0 }}>
                  Your prereq chain is solid. The wrong answer reflects a slip
                  on the question itself, not a gap. Re-attempt similar
                  questions to confirm.
                </p>
              </>
            )}
          </div>

          {result.path.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ fontSize: 13, marginBottom: 6 }}>Path</h4>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {result.path.map((node, idx) => (
                  <div key={`${node}-${idx}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        padding: "6px 12px",
                        background: "var(--paper-2)",
                        border:
                          idx === result.path.length - 1
                            ? "2px solid var(--warn, #f59e0b)"
                            : "1px solid var(--rule, #e1e5ee)",
                        borderRadius: 6,
                        fontFamily: "monospace",
                        fontSize: 13,
                      }}
                    >
                      {node}
                      <span style={{ opacity: 0.6, marginLeft: 6 }}>
                        ({((masteryMap[node] ?? 0) * 100).toFixed(0)}%)
                      </span>
                    </div>
                    {idx < result.path.length - 1 && <span>→</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.weakConcepts.length > 0 && (
            <div>
              <h4 style={{ fontSize: 13, marginBottom: 6 }}>
                All weak concepts on the chain ({result.weakConcepts.length})
              </h4>
              <ul style={{ fontSize: 13, paddingLeft: 20 }}>
                {result.weakConcepts.map((c) => (
                  <li key={c}>
                    <code>{c}</code>{" "}
                    <span style={{ opacity: 0.6 }}>
                      mastery {((masteryMap[c] ?? 0) * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.notes.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
              <strong>Walker notes:</strong>{" "}
              {result.notes.join(" · ")}
            </div>
          )}
        </section>
      )}
    </AppShell>
  );
}