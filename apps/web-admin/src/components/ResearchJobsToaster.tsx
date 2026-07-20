// ResearchJobsToaster — floating notifications for async exam-builder
// research jobs. Mounted once in AdminShell so it follows the admin across
// every page: a quiet "generating…" pill while a draft is being built, and
// a "draft ready → Review" / "failed → Retry" toast when it finishes.
//
// Review routes to /exams/new?job=<id>, where ExamBuilder loads the proposal
// by job id and renders the review step.

import { useNavigate } from "react-router-dom";

import { useResearchJobs } from "../lib/useResearchJobs";

export function ResearchJobsToaster() {
  const navigate = useNavigate();
  const { pending, unacked, acknowledge } = useResearchJobs();

  if (pending.length === 0 && unacked.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 340,
      }}
      aria-live="polite"
    >
      {pending.map((j) => (
        <div key={j.jobId} style={pillStyle}>
          <span style={{ ...dotStyle, background: "var(--info)" }} className="vidya-pulse" />
          <span style={{ fontSize: 13 }}>
            Generating <strong>{j.examName ?? j.examCode ?? "exam"}</strong> draft…
          </span>
        </div>
      ))}

      {unacked.map((j) => {
        const ok = j.status === "succeeded";
        return (
          <div
            key={j.jobId}
            role="status"
            style={{
              ...cardStyle,
              borderColor: ok ? "var(--good)" : "var(--bad)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {ok ? "✓ Draft ready" : "✕ Research failed"}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
              {j.examName ?? j.examCode ?? "Exam"}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                style={primaryBtn}
                onClick={() => {
                  acknowledge(j.jobId);
                  navigate(ok ? `/exams/new?job=${j.jobId}` : "/exams/new");
                }}
              >
                {ok ? "Review draft" : "Try again"}
              </button>
              <button style={ghostBtn} onClick={() => acknowledge(j.jobId)}>
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const pillStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 999,
  background: "var(--paper)",
  border: "1px solid var(--line)",
  boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
};

const dotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  flexShrink: 0,
};

const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: 12,
  borderRadius: 8,
  background: "var(--paper)",
  border: "1px solid var(--line)",
  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
};

const primaryBtn: React.CSSProperties = {
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 6,
  border: "none",
  background: "var(--ink)",
  color: "var(--paper)",
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  padding: "5px 12px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--ink-2)",
  cursor: "pointer",
};
