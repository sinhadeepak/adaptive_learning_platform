// DraftJobsToaster — floating notifications for async bulk question-generation
// jobs. Mounted once in AppShell so it follows the author across pages: a quiet
// "generating…" pill while a batch runs, and a "N questions ready → Review"
// toast when it finishes. Review routes to /questions/new?bulkJob=<id>, where
// BulkAIGenerator loads the drafts.

import { useNavigate } from "react-router-dom";

import { useDraftJobs } from "../lib/useDraftJobs";

export function DraftJobsToaster() {
  const navigate = useNavigate();
  const { pending, unacked, acknowledge } = useDraftJobs();

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
      <style>{`@keyframes vidyaPulse{0%,100%{opacity:1}50%{opacity:.45}} .vidya-pulse{animation:vidyaPulse 1.4s ease-in-out infinite}`}</style>
      {pending.map((j) => (
        <div key={j.jobId} style={pill}>
          <span style={{ ...dot, background: "var(--info, #4F87F6)" }} className="vidya-pulse" />
          <span style={{ fontSize: 13 }}>
            Generating{" "}
            <strong>
              {j.progress ? `${j.progress.done}/${j.progress.total}` : (j.count ?? "")}
            </strong>{" "}
            questions{j.topic ? <> — {j.topic}</> : null}…
          </span>
        </div>
      ))}

      {unacked.map((j) => {
        const ok = j.status === "succeeded";
        return (
          <div
            key={j.jobId}
            role="status"
            style={{ ...card, borderColor: ok ? "var(--good, #10C47A)" : "var(--bad, #F43F5E)" }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {ok ? `✓ ${j.count ?? ""} questions ready` : "✕ Generation failed"}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2, #6b7280)" }}>
              {j.topic ?? "Bulk draft"}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                style={primaryBtn}
                onClick={() => {
                  acknowledge(j.jobId);
                  navigate(ok ? `/questions/new?bulkJob=${j.jobId}` : "/questions/new");
                }}
              >
                {ok ? "Review drafts" : "Try again"}
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

const pill: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 999,
  background: "var(--paper, #fff)",
  border: "1px solid var(--line, #e5e7eb)",
  boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
};

const dot: React.CSSProperties = { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 };

const card: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: 12,
  borderRadius: 8,
  background: "var(--paper, #fff)",
  border: "1px solid var(--line, #e5e7eb)",
  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
};

const primaryBtn: React.CSSProperties = {
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 6,
  border: "none",
  background: "var(--ink, #111827)",
  color: "var(--paper, #fff)",
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  padding: "5px 12px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid var(--line, #e5e7eb)",
  background: "transparent",
  color: "var(--ink-2, #6b7280)",
  cursor: "pointer",
};
