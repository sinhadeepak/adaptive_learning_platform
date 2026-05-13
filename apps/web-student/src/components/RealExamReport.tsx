// Phase 1D-4 — Self-report a real-exam score / rank / admit on Profile.

import { useEffect, useState } from "react";
import { auth } from "../lib/api";
import { useAuth } from "../lib/auth-provider";

interface Outcome {
  examCode: string;
  realScore: number | null;
  realRank: number | null;
  admittedTo: string | null;
  reportedAt: string;
}

const EXAMS = ["NEET", "JEE", "UPSC", "CBSE"];

export function RealExamReport() {
  const { user } = useAuth();
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [examCode, setExamCode] = useState("NEET");
  const [score, setScore] = useState("");
  const [rank, setRank] = useState("");
  const [admit, setAdmit] = useState("");
  const [saved, setSaved] = useState(false);

  async function load() {
    if (!user) return;
    const r = await auth.fetch(`/api/v1/analytics/real-exam-outcomes/${user.id}`);
    if (r.ok) {
      const body = (await r.json()) as { items: Outcome[] };
      setOutcomes(body.items);
    }
    setLoaded(true);
  }

  useEffect(() => {
    void load();
  }, [user]);

  async function save() {
    if (!user) return;
    const r = await auth.fetch(`/api/v1/analytics/real-exam-outcomes/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        examCode,
        realScore: score === "" ? null : parseFloat(score),
        realRank: rank === "" ? null : parseInt(rank, 10),
        admittedTo: admit.trim() || null,
      }),
    });
    if (r.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setOpen(false);
      setScore("");
      setRank("");
      setAdmit("");
      void load();
    }
  }

  async function remove(ec: string) {
    if (!user) return;
    if (!confirm(`Remove ${ec} outcome?`)) return;
    await auth.fetch(`/api/v1/analytics/real-exam-outcomes/${user.id}/${ec}`, {
      method: "DELETE",
    });
    void load();
  }

  if (!loaded) return null;

  return (
    <section
      className="card"
      style={{
        padding: 16,
        background: "var(--bg-surface1)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        marginTop: 16,
      }}
    >
      <h3 style={{ marginTop: 0, fontSize: 14 }}>Real exam outcomes</h3>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Self-report your real exam score / rank / admit. We use it to
        calibrate the career-outcome card on your dashboard. Stays private
        unless you opt into the leaderboard.
      </p>

      {outcomes.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0" }}>
          {outcomes.map((o) => (
            <li
              key={o.examCode}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: 6,
                marginBottom: 4,
                fontSize: 13,
              }}
            >
              <strong style={{ minWidth: 60 }}>{o.examCode}</strong>
              <span style={{ color: "var(--text-muted)" }}>
                {o.realScore !== null ? `${o.realScore}` : "—"} score ·{" "}
                {o.realRank !== null ? `AIR ${o.realRank.toLocaleString()}` : "—"} rank
                {o.admittedTo ? ` · ${o.admittedTo}` : ""}
              </span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => remove(o.examCode)}
                style={{
                  background: "transparent",
                  border: 0,
                  color: "var(--color-red)",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen((v) => !v)}
        style={{ marginTop: 8 }}
      >
        {open ? "Cancel" : "+ Report an outcome"}
      </button>

      {open && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            display: "grid",
            gap: 8,
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          <label style={lbl}>
            Exam
            <select value={examCode} onChange={(e) => setExamCode(e.target.value)} style={inp}>
              {EXAMS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label style={lbl}>
            Score
            <input
              type="number"
              step="0.01"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="e.g. 540"
              style={inp}
            />
          </label>
          <label style={lbl}>
            All-India rank
            <input
              type="number"
              value={rank}
              onChange={(e) => setRank(e.target.value)}
              placeholder="e.g. 12500"
              style={inp}
            />
          </label>
          <label style={lbl}>
            Admitted to
            <input
              type="text"
              value={admit}
              onChange={(e) => setAdmit(e.target.value)}
              placeholder="e.g. AIIMS Delhi"
              style={inp}
            />
          </label>
          <div style={{ gridColumn: "1 / span 2", display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={save}>
              Save
            </button>
            {saved && <span style={{ color: "var(--color-green)", alignSelf: "center" }}>✓ saved</span>}
          </div>
        </div>
      )}
    </section>
  );
}

const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", fontSize: 11, color: "var(--text-muted)" };
const inp: React.CSSProperties = {
  marginTop: 4,
  padding: 8,
  background: "var(--bg-surface1)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
  borderRadius: 6,
  fontSize: 13,
};
