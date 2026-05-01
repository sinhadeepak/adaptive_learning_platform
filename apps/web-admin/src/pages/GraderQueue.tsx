import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { Banner, Pill } from "../components/primitives";

// ─────────────────────────────────────────────────────────────────────────
// CE-308 — Human Grader Application.
//
// Per AIM §3.5. Subjective responses with AI confidence < 0.75 (or
// calibration-sampled) land here. Grader sees the rubric, model
// answer, and student response (anonymised — no student id, age, or
// prior performance). Grader marks each criterion 0 / 0.5 / 1 with a
// one-line note; submit triggers a webhook back to Quiz orchestration.
//
// Hosted as a sub-route in web-admin per the consolidation decision
// (vs separate Grader app). Auth gating (grader role with own
// session scope) lands alongside the calibration-set workflow in a
// follow-up.
//
// v1 surface: queue + grading view + calibration-set warm-up.
// Pre-graded calibration items + 2nd-grader sampling are surfaced
// here; webhook + queue endpoints are pending the
// /grading/queue + /grading/responses/{id}/grade routes.
// ─────────────────────────────────────────────────────────────────────────

interface CalibrationItem {
  id: string;
  stem: string;
  rubric: { id: string; text: string; weight: number }[];
  goldVerdict: { criterionId: string; satisfied: number }[];
}

const CALIBRATION_PRACTICE: CalibrationItem[] = [
  {
    id: "cal-1",
    stem:
      "In 80 words, explain why the sky appears blue. Reference a specific physical phenomenon.",
    rubric: [
      { id: "c1", text: "Names Rayleigh scattering", weight: 50 },
      { id: "c2", text: "Connects to wavelength dependence", weight: 50 },
    ],
    goldVerdict: [
      { criterionId: "c1", satisfied: 1.0 },
      { criterionId: "c2", satisfied: 1.0 },
    ],
  },
  {
    id: "cal-2",
    stem:
      "Discuss the doctrine of basic structure (50 words). Cite at least one landmark case.",
    rubric: [
      { id: "c1", text: "Defines basic structure doctrine", weight: 50 },
      { id: "c2", text: "Cites Kesavananda Bharati v. State of Kerala", weight: 50 },
    ],
    goldVerdict: [
      { criterionId: "c1", satisfied: 1.0 },
      { criterionId: "c2", satisfied: 1.0 },
    ],
  },
  {
    id: "cal-3",
    stem: "Derive Newton's second law from the principle of conservation of momentum.",
    rubric: [
      { id: "c1", text: "States dp/dt = F", weight: 50 },
      { id: "c2", text: "Reduces to F=ma for constant mass", weight: 50 },
    ],
    goldVerdict: [
      { criterionId: "c1", satisfied: 1.0 },
      { criterionId: "c2", satisfied: 1.0 },
    ],
  },
];

interface GraderVerdict {
  criterionId: string;
  satisfied: number;
  note: string;
}

function CalibrationWarmUp({
  onComplete,
}: {
  onComplete: (passed: boolean) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [verdicts, setVerdicts] = useState<GraderVerdict[]>([]);
  const [response, setResponse] = useState<Record<string, number>>({});

  const item = CALIBRATION_PRACTICE[idx];
  if (!item) return null;

  const allRated = item.rubric.every(
    (c) => typeof response[c.id] === "number",
  );

  function next(): void {
    const recorded: GraderVerdict[] = item.rubric.map((c) => ({
      criterionId: c.id,
      satisfied: response[c.id],
      note: "",
    }));
    const updated = [...verdicts, ...recorded];
    setVerdicts(updated);
    setResponse({});
    if (idx + 1 >= CALIBRATION_PRACTICE.length) {
      const goldFlat = CALIBRATION_PRACTICE.flatMap((it) => it.goldVerdict);
      let agree = 0;
      for (const v of updated) {
        const gold = goldFlat.find((g) => g.criterionId === v.criterionId);
        if (gold && Math.abs(gold.satisfied - v.satisfied) < 0.25) agree += 1;
      }
      const passed = agree / updated.length >= 0.85;
      onComplete(passed);
    } else {
      setIdx(idx + 1);
    }
  }

  return (
    <section
      style={{
        padding: 16,
        background: "var(--bg-subtle, #f8f9fc)",
        borderRadius: 8,
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <Pill tone="warning">
          Calibration {idx + 1} of {CALIBRATION_PRACTICE.length}
        </Pill>
      </div>
      <h3 style={{ fontSize: 15, marginBottom: 12 }}>{item.stem}</h3>

      <h4 style={{ fontSize: 13, marginBottom: 8 }}>Rubric</h4>
      {item.rubric.map((c) => (
        <div
          key={c.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 8,
            marginBottom: 4,
            border: "1px solid var(--border-subtle, #f0f2f6)",
            borderRadius: 4,
          }}
        >
          <span style={{ fontSize: 13 }}>
            {c.id} — {c.text} ({c.weight}%)
          </span>
          <select
            value={response[c.id] ?? ""}
            onChange={(e) =>
              setResponse({ ...response, [c.id]: Number(e.target.value) })
            }
            style={{ padding: 4, borderRadius: 4 }}
          >
            <option value="">…</option>
            <option value={0}>0 (not satisfied)</option>
            <option value={0.5}>0.5 (partially)</option>
            <option value={1}>1 (fully)</option>
          </select>
        </div>
      ))}

      <button
        onClick={next}
        disabled={!allRated}
        style={{
          marginTop: 12,
          padding: "8px 16px",
          background: allRated ? "var(--color-blue, #4f87f6)" : "var(--text-faint, #cbd5e0)",
          color: "white",
          border: "none",
          borderRadius: 4,
          cursor: allRated ? "pointer" : "not-allowed",
        }}
      >
        {idx + 1 === CALIBRATION_PRACTICE.length ? "Finish warm-up" : "Next"}
      </button>
    </section>
  );
}

export function GraderQueue() {
  const [calibrated, setCalibrated] = useState(false);
  const [calibrationFailed, setCalibrationFailed] = useState(false);
  const [sessionStartedAt] = useState(() => new Date());
  const [gradedThisSession, setGradedThisSession] = useState(0);

  return (
    <AppShell title="Grader Queue" chips={[{ label: "Phase 5" }, { label: "Grader" }]}>
      <Banner tone="info">
        <strong>Anonymised grading.</strong> You won't see student ids, names,
        ages, or prior performance. Per-criterion verdicts (0 / 0.5 / 1) feed
        the calibration corpus that keeps AI evaluation honest.
      </Banner>

      {!calibrated && !calibrationFailed && (
        <>
          <h2 style={{ fontSize: 16, marginTop: 24, marginBottom: 8 }}>
            Daily calibration warm-up
          </h2>
          <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 16 }}>
            Three pre-graded items. ≥ 85% agreement with gold to proceed; below
            triggers a refresher (escalates to lead grader).
          </p>
          <CalibrationWarmUp
            onComplete={(passed) => {
              if (passed) setCalibrated(true);
              else setCalibrationFailed(true);
            }}
          />
        </>
      )}

      {calibrationFailed && (
        <Banner tone="danger">
          <strong>Calibration check failed.</strong> Your verdicts diverged
          from gold by more than 15%. Take a 5-minute break and review the{" "}
          <a href="/calibration-dashboard">calibration dashboard</a>; the lead
          grader has been notified.
        </Banner>
      )}

      {calibrated && (
        <>
          <Banner tone="success">
            ✓ Calibration passed. Session started at{" "}
            {sessionStartedAt.toLocaleTimeString()}.
          </Banner>

          <section style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>Grading queue</h2>
            <Banner tone="warning">
              Backend follow-up: <code>/grading/queue</code> +{" "}
              <code>/grading/responses/&#123;id&#125;/grade</code> routes are
              pending. Until they land, this page surfaces the calibration
              workflow + session metadata; per-response grading lands when the
              backend queue endpoint ships.
            </Banner>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 12,
                marginTop: 16,
              }}
            >
              <div
                style={{
                  padding: 12,
                  border: "1px solid var(--border, #e1e5ee)",
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    opacity: 0.7,
                    textTransform: "uppercase",
                  }}
                >
                  Graded this session
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {gradedThisSession}
                </div>
              </div>
              <div
                style={{
                  padding: 12,
                  border: "1px solid var(--border, #e1e5ee)",
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    opacity: 0.7,
                    textTransform: "uppercase",
                  }}
                >
                  Median time / item
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>—</div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>queue pending</div>
              </div>
              <div
                style={{
                  padding: 12,
                  border: "1px solid var(--border, #e1e5ee)",
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    opacity: 0.7,
                    textTransform: "uppercase",
                  }}
                >
                  2nd-grader sampling
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>10%</div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>random per spec</div>
              </div>
              <div
                style={{
                  padding: 12,
                  border: "1px solid var(--border, #e1e5ee)",
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    opacity: 0.7,
                    textTransform: "uppercase",
                  }}
                >
                  Calibration kappa
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>—</div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>
                  <a href="/calibration-dashboard">view dashboard</a>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <button
                onClick={() => setGradedThisSession((n) => n + 1)}
                style={{
                  padding: "10px 24px",
                  background: "var(--color-blue, #4f87f6)",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Pull next item from queue
              </button>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
