/**
 * ExamBuilder — admin page that creates a new exam by:
 *   1. Collecting basic info (name, code, level, target year, hints).
 *   2. Calling /admin/exam-builder/research → OpenAI drafts the
 *      subject + topic + pool structure.
 *   3. Letting the admin review/edit each row inline before saving.
 *   4. Calling /admin/exam-builder/save → catalog_schema rows land.
 *
 * Mandatory vs optional is the headline structural concept — every
 * subject is either mandatory (every student takes it) or sits in a
 * pool that defines pick_min/pick_max. UPSC Mains, for example, has
 * a pool for the Indian-language qualifying paper (pick 1 of 22) and
 * another for the optional subject (pick 1 of 26).
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { AdminShell } from "../components/AdminShell";
import { auth } from "../lib/api";
import { diffExam, type DiffStatus } from "../lib/examDiff";

type Step = "basics" | "review" | "saved";

type Level =
  | "school"
  | "competitive_undergrad"
  | "competitive_postgrad"
  | "civil_services"
  | "language"
  | "professional"
  | "other";

interface TopicDraft {
  code: string;
  title: string;
  description: string | null;
  // Set after a re-analyze: diff status vs the previously-saved exam, and
  // whether the admin chose to Keep a row the AI dropped.
  _status?: DiffStatus;
  _kept?: boolean;
}

interface SubjectDraft {
  code: string;
  name: string;
  description: string | null;
  is_mandatory: boolean;
  pool_code: string | null;
  topics: TopicDraft[];
  _status?: DiffStatus;
  _kept?: boolean;
}

interface PoolDraft {
  code: string;
  name: string;
  description: string | null;
  pick_min: number;
  pick_max: number;
}

interface ExamProposal {
  code: string;
  name: string;
  subtitle: string | null;
  pools: PoolDraft[];
  subjects: SubjectDraft[];
  notes: string | null;
}

// A row the AI dropped (removed) is excluded from the save payload unless the
// admin chose to Keep it. Diff-only fields (_status/_kept) are stripped so the
// backend sees a clean proposal.
function isDropped(row: { _status?: DiffStatus; _kept?: boolean }): boolean {
  return row._status === "removed" && !row._kept;
}

function cleanForSave(proposal: ExamProposal): ExamProposal {
  return {
    ...proposal,
    subjects: proposal.subjects
      .filter((s) => !isDropped(s))
      .map(({ _status, _kept, ...s }) => ({
        ...s,
        topics: s.topics
          .filter((t) => !isDropped(t))
          .map(({ _status: _ts, _kept: _tk, ...t }) => t),
      })),
  };
}

const DIFF_META: Record<DiffStatus, { label: string; color: string } | null> = {
  added: { label: "ADDED", color: "var(--good)" },
  removed: { label: "REMOVED", color: "var(--bad)" },
  modified: { label: "CHANGED", color: "var(--gold)" },
  unchanged: null,
};

function DiffBadge({ status }: { status?: DiffStatus }) {
  const meta = status ? DIFF_META[status] : null;
  if (!meta) return null;
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.4,
        padding: "1px 6px",
        borderRadius: 999,
        color: meta.color,
        border: `1px solid ${meta.color}`,
      }}
    >
      {meta.label}
    </span>
  );
}

export function ExamBuilder() {
  const navigate = useNavigate();
  const { examId: editExamId } = useParams<{ examId?: string }>();
  const [searchParams] = useSearchParams();
  const jobParam = searchParams.get("job");
  const isEditMode = Boolean(editExamId);

  // True while a background research job for `jobParam` is still generating.
  const [pending, setPending] = useState(false);

  // Edit mode skips basics/research and lands on review with existing
  // data pre-populated. The /exams/edit/:examId route hits this branch.
  const [step, setStep] = useState<Step>(isEditMode ? "review" : "basics");

  // Step 1 — basics.
  const [examCode, setExamCode] = useState("");
  const [examName, setExamName] = useState("");
  const [level, setLevel] = useState<Level>("competitive_undergrad");
  const [targetYear, setTargetYear] = useState<string>("");
  const [adminNotes, setAdminNotes] = useState("");

  // Step 2 — proposal.
  const [proposal, setProposal] = useState<ExamProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 3 — saved.
  const [savedSummary, setSavedSummary] = useState<{
    examId: string;
    subjectsCreated: number;
    topicsCreated: number;
    poolsCreated: number;
    subjectsRetired?: number;
    topicsRetired?: number;
    poolsRetired?: number;
  } | null>(null);

  // Question seeding — kicked off from the Saved or Edit screens.
  const [seeding, setSeeding] = useState(false);
  const [seedSummary, setSeedSummary] = useState<{
    topics: number;
    questions: number;
    failures: number;
  } | null>(null);

  // The exam as last saved — used as the baseline to diff a re-analyze
  // against, so we can highlight what the AI added / removed / changed.
  const baselineRef = useRef<ExamProposal | null>(null);

  // Edit mode: load existing exam structure on mount.
  useEffect(() => {
    if (!editExamId) return;
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const res = await auth.fetch(
          `/api/v1/admin/exam-builder/exams/${encodeURIComponent(editExamId)}`,
        );
        if (!res.ok) {
          const detail = await safeDetail(res);
          throw new Error(detail || `Load failed (HTTP ${res.status})`);
        }
        const body = (await res.json()) as ExamProposal;
        baselineRef.current = body;
        setProposal(body);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        setBusy(false);
      }
    })();
  }, [editExamId]);

  // Re-analyze an existing exam: enqueue a structure-aware research job
  // (delta mode) and hand off to ?job=<id>. The current structure becomes
  // both the AI's seed and the diff baseline.
  async function reanalyze(remark: string) {
    if (!proposal || !editExamId) return;
    baselineRef.current = proposal;
    setError(null);
    setBusy(true);
    try {
      const res = await auth.fetch("/api/v1/admin/exam-builder/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: proposal.code,
          name: proposal.name,
          level,
          notes: remark.trim() || undefined,
          existing: {
            subjects: proposal.subjects.map((s) => ({
              code: s.code,
              name: s.name,
              topics: s.topics.map((t) => ({ code: t.code, title: t.title })),
            })),
          },
        }),
      });
      if (!res.ok) {
        const detail = await safeDetail(res);
        throw new Error(detail || `Re-analyze failed (HTTP ${res.status})`);
      }
      const body = (await res.json()) as { jobId: string };
      navigate(`/exams/edit/${editExamId}?job=${body.jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-analyze failed");
    } finally {
      setBusy(false);
    }
  }

  // Enqueue a background research job and hand off to ?job=<id>, where the
  // effect below watches it. The admin is free to navigate away; the global
  // toaster (AdminShell) notifies when the draft is ready.
  async function runResearch() {
    setError(null);
    setBusy(true);
    try {
      const res = await auth.fetch("/api/v1/admin/exam-builder/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: examCode.trim(),
          name: examName.trim(),
          level,
          target_year: targetYear ? Number(targetYear) : undefined,
          notes: adminNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const detail = await safeDetail(res);
        throw new Error(detail || `Research failed (HTTP ${res.status})`);
      }
      const body = (await res.json()) as { jobId: string };
      navigate(`/exams/new?job=${body.jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Research failed");
    } finally {
      setBusy(false);
    }
  }

  // Watch a background research job (?job=<id>): poll until it finishes, then
  // load the proposal into the Review step. Survives refresh / arriving via
  // the completion toast.
  useEffect(() => {
    if (!jobParam) {
      setPending(false);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    setPending(true);
    setError(null);

    const poll = async () => {
      try {
        const res = await auth.fetch(
          `/api/v1/admin/exam-builder/research/${encodeURIComponent(jobParam)}`,
        );
        if (!res.ok) {
          const detail = await safeDetail(res);
          throw new Error(detail || `Load failed (HTTP ${res.status})`);
        }
        const body = (await res.json()) as {
          status: string;
          result: ExamProposal | null;
          error: string | null;
        };
        if (cancelled) return;
        if (body.status === "succeeded" && body.result) {
          // Re-analyze: tag each row added/removed/modified vs the baseline
          // and re-inject dropped rows so the admin sees the full diff.
          const base = baselineRef.current;
          if (base) {
            const { subjects } = diffExam(base, body.result);
            setProposal({ ...body.result, subjects });
          } else {
            setProposal(body.result);
          }
          setStep("review");
          setPending(false);
        } else if (body.status === "failed") {
          setError(body.error || "Research failed. Please try again.");
          setPending(false);
        } else {
          timer = window.setTimeout(poll, 5000);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Load failed");
          setPending(false);
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [jobParam]);

  async function seedQuestions(examId: string, perTopic: number) {
    setError(null);
    setSeeding(true);
    setSeedSummary(null);
    try {
      const res = await auth.fetch("/api/v1/admin/exam-builder/seed-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exam_id: examId,
          questions_per_topic: perTopic,
          difficulty_min: -1.0,
          difficulty_max: 1.5,
        }),
      });
      if (!res.ok) {
        const detail = await safeDetail(res);
        throw new Error(detail || `Seed failed (HTTP ${res.status})`);
      }
      const body = (await res.json()) as {
        topics_processed: number;
        questions_created: number;
        failures: { topic_id: string; error: string }[];
      };
      setSeedSummary({
        topics: body.topics_processed,
        questions: body.questions_created,
        failures: body.failures.length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  }

  async function save() {
    if (!proposal) return;
    setError(null);
    setBusy(true);
    try {
      const res = await auth.fetch("/api/v1/admin/exam-builder/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanForSave(proposal)),
      });
      if (!res.ok) {
        const detail = await safeDetail(res);
        throw new Error(detail || `Save failed (HTTP ${res.status})`);
      }
      const body = (await res.json()) as {
        exam_id: string;
        subjects_created: number;
        topics_created: number;
        pools_created: number;
        subjects_retired?: number;
        topics_retired?: number;
        pools_retired?: number;
      };
      setSavedSummary({
        examId: body.exam_id,
        subjectsCreated: body.subjects_created,
        topicsCreated: body.topics_created,
        poolsCreated: body.pools_created,
        subjectsRetired: body.subjects_retired,
        topicsRetired: body.topics_retired,
        poolsRetired: body.pools_retired,
      });
      setStep("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      crumbs={isEditMode ? "Exams · edit" : "Exams · new"}
      title={isEditMode ? "Edit exam" : "Add new exam"}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100 }}>
        {!isEditMode && <Stepper step={step} />}
        {isEditMode && busy && !proposal && (
          <div className="card" style={{ padding: 16, fontSize: 13 }}>
            Loading exam structure…
          </div>
        )}
        {error && (
          <div
            role="alert"
            style={{
              padding: 10,
              border: "1px solid var(--bad)",
              borderRadius: 6,
              color: "var(--bad)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {pending && <GeneratingPanel onLeave={() => navigate("/exams")} />}

        {!pending && step === "basics" && (
          <BasicsStep
            examCode={examCode}
            setExamCode={setExamCode}
            examName={examName}
            setExamName={setExamName}
            level={level}
            setLevel={setLevel}
            targetYear={targetYear}
            setTargetYear={setTargetYear}
            adminNotes={adminNotes}
            setAdminNotes={setAdminNotes}
            busy={busy}
            onContinue={runResearch}
          />
        )}

        {step === "review" && proposal && (
          <ReviewStep
            proposal={proposal}
            setProposal={setProposal}
            busy={busy}
            onBack={() => setStep("basics")}
            onSave={save}
            onReanalyze={isEditMode ? reanalyze : undefined}
          />
        )}

        {step === "saved" && savedSummary && (
          <SavedStep
            summary={savedSummary}
            seeding={seeding}
            seedSummary={seedSummary}
            onSeed={(perTopic) => seedQuestions(savedSummary.examId, perTopic)}
            onAddAnother={() => {
              setExamCode("");
              setExamName("");
              setAdminNotes("");
              setTargetYear("");
              setProposal(null);
              setSavedSummary(null);
              setSeedSummary(null);
              setStep("basics");
            }}
            onGoExams={() => navigate("/exams")}
          />
        )}
      </div>
    </AdminShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// Stepper
// ─────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "basics", label: "1. Basics" },
    { key: "review", label: "2. Review AI draft" },
    { key: "saved", label: "3. Saved" },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
      {steps.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background:
                i === idx
                  ? "var(--info)"
                  : i < idx
                    ? "var(--good)"
                    : "var(--paper-2)",
              color: i <= idx ? "var(--paper)" : "var(--ink-3)",
            }}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <span style={{ color: "var(--ink-4)" }}>→</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Generating — shown while a background research job is in flight
// ─────────────────────────────────────────────────────────────────

function GeneratingPanel({ onLeave }: { onLeave: () => void }) {
  return (
    <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          className="vidya-pulse"
          style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--info)" }}
        />
        <strong style={{ fontSize: 15 }}>Generating your exam draft…</strong>
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0, lineHeight: 1.5 }}>
        The AI is drafting the full subject + topic structure. This can take a
        couple of minutes for a large exam. <strong>You can leave this page</strong> —
        we&rsquo;ll pop a notification in the corner when the draft is ready to review,
        and this page will open it automatically if you stay.
      </p>
      <div>
        <button
          onClick={onLeave}
          style={{
            padding: "7px 14px",
            fontSize: 13,
            borderRadius: 6,
            border: "1px solid var(--line)",
            background: "transparent",
            color: "var(--ink-2)",
            cursor: "pointer",
          }}
        >
          ← Do other work meanwhile
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Step 1 — Basics
// ─────────────────────────────────────────────────────────────────

interface BasicsProps {
  examCode: string;
  setExamCode: (v: string) => void;
  examName: string;
  setExamName: (v: string) => void;
  level: Level;
  setLevel: (v: Level) => void;
  targetYear: string;
  setTargetYear: (v: string) => void;
  adminNotes: string;
  setAdminNotes: (v: string) => void;
  busy: boolean;
  onContinue: () => void;
}

function BasicsStep(p: BasicsProps) {
  const valid = p.examCode.trim().length >= 2 && p.examName.trim().length >= 2;
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
        Tell the AI what to research
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 18 }}>
        OpenAI drafts the subject list, sub-topics, and any "pick N of M"
        pools (e.g. UPSC Mains optional subject). You review + edit before
        anything lands in the catalog.
      </div>
      <Grid2>
        <Field label="Exam code" hint="ALL_CAPS_SNAKE — e.g. UPSC_MAINS_2027">
          <input
            type="text"
            value={p.examCode}
            onChange={(e) => p.setExamCode(e.target.value.toUpperCase())}
            placeholder="UPSC_MAINS"
            style={inputStyle}
          />
        </Field>
        <Field label="Exam name" hint="Human-readable title — shown to students">
          <input
            type="text"
            value={p.examName}
            onChange={(e) => p.setExamName(e.target.value)}
            placeholder="UPSC Civil Services Mains"
            style={inputStyle}
          />
        </Field>
        <Field label="Level">
          <select value={p.level} onChange={(e) => p.setLevel(e.target.value as Level)} style={inputStyle}>
            <option value="school">School</option>
            <option value="competitive_undergrad">Competitive – Undergrad (JEE, NEET)</option>
            <option value="competitive_postgrad">Competitive – Postgrad (CAT, GATE, GMAT)</option>
            <option value="civil_services">Civil Services (UPSC, State PSC)</option>
            <option value="language">Language proficiency</option>
            <option value="professional">Professional certification</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Target year" hint="Optional — anchors the syllabus">
          <input
            type="number"
            value={p.targetYear}
            onChange={(e) => p.setTargetYear(e.target.value)}
            placeholder="2027"
            style={inputStyle}
          />
        </Field>
      </Grid2>
      <Field
        label="Admin hints (optional)"
        hint="Free-form — call out anything the AI would miss. e.g. 'qualifying papers + 4 GS + 1 optional which produces papers VI and VII'"
      >
        <textarea
          rows={4}
          value={p.adminNotes}
          onChange={(e) => p.setAdminNotes(e.target.value)}
          placeholder=""
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      </Field>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 12,
          marginTop: 18,
        }}
      >
        {!valid && !p.busy && (
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            Enter an exam code and name to continue.
          </span>
        )}
        <button
          onClick={p.onContinue}
          disabled={!valid || p.busy}
          className="btn btn-primary"
          style={{
            padding: "8px 18px",
            opacity: !valid || p.busy ? 0.45 : 1,
            cursor: !valid || p.busy ? "not-allowed" : "pointer",
          }}
        >
          {p.busy ? "Researching…" : "◈ Research with AI →"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Step 2 — Review draft
// ─────────────────────────────────────────────────────────────────

interface ReviewProps {
  proposal: ExamProposal;
  setProposal: (p: ExamProposal) => void;
  busy: boolean;
  onBack: () => void;
  onSave: () => void;
  onReanalyze?: (remark: string) => void;
}

function ReviewStep({ proposal, setProposal, busy, onBack, onSave, onReanalyze }: ReviewProps) {
  // True once a re-analyze has tagged rows with diff status.
  const hasDiff = proposal.subjects.some(
    (s) => s._status || s.topics.some((t) => t._status),
  );
  // Inline remark panel for re-analyze — an optional hint fed into the prompt.
  const [remarkOpen, setRemarkOpen] = useState(false);
  const [remark, setRemark] = useState("");
  const subjectCount = proposal.subjects.length;
  const topicCount = proposal.subjects.reduce(
    (acc, s) => acc + s.topics.length,
    0,
  );
  const mandatoryCount = proposal.subjects.filter((s) => s.is_mandatory).length;

  function patchSubject(idx: number, patch: Partial<SubjectDraft>) {
    const subjects = proposal.subjects.slice();
    subjects[idx] = { ...subjects[idx], ...patch };
    setProposal({ ...proposal, subjects });
  }

  function removeSubject(idx: number) {
    const subjects = proposal.subjects.slice();
    subjects.splice(idx, 1);
    setProposal({ ...proposal, subjects });
  }

  function addSubject() {
    // Pick a unique code that won't collide with existing subjects.
    const used = new Set(proposal.subjects.map((s) => s.code));
    let n = 1;
    let code = `NEW_SUBJECT_${n}`;
    while (used.has(code)) {
      n += 1;
      code = `NEW_SUBJECT_${n}`;
    }
    setProposal({
      ...proposal,
      subjects: [
        ...proposal.subjects,
        {
          code,
          name: "New subject",
          description: null,
          is_mandatory: true,
          pool_code: null,
          topics: [],
        },
      ],
    });
  }

  function patchPool(idx: number, patch: Partial<PoolDraft>) {
    const pools = proposal.pools.slice();
    pools[idx] = { ...pools[idx], ...patch };
    setProposal({ ...proposal, pools });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Top summary */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {proposal.name}
              <span style={{ color: "var(--ink-3)", fontSize: 13, marginLeft: 8 }}>
                · {proposal.code}
              </span>
            </div>
            {proposal.subtitle && (
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                {proposal.subtitle}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {subjectCount} subjects · {mandatoryCount} mandatory ·{" "}
              {proposal.pools.length} pools · {topicCount} topics
            </div>
            {onReanalyze && (
              <button
                onClick={() => setRemarkOpen((o) => !o)}
                disabled={busy}
                className="btn btn-ghost"
                style={{ padding: "6px 12px", fontSize: 12 }}
              >
                ⟳ Re-analyze with AI
              </button>
            )}
          </div>
        </div>
        {onReanalyze && remarkOpen && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: "var(--paper-2)",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Remark for the AI <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>(optional)</span>
            </label>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
              Tell the AI what to focus on, add, drop, or fix — e.g. &ldquo;align Polity
              to the 2027 syllabus and add a Disaster Management topic.&rdquo; This is
              added to the prompt for every subject.
            </div>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={2}
              placeholder="e.g. emphasise current affairs; drop pre-2015 topics"
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => {
                  setRemarkOpen(false);
                  setRemark("");
                }}
                disabled={busy}
                className="btn btn-ghost"
                style={{ padding: "6px 12px", fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                onClick={() => onReanalyze(remark)}
                disabled={busy}
                className="btn btn-primary"
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  opacity: busy ? 0.45 : 1,
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                ⟳ Start re-analyze
              </button>
            </div>
          </div>
        )}
        {hasDiff && (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 14,
              fontSize: 11,
              color: "var(--ink-2)",
              alignItems: "center",
            }}
          >
            <strong>AI changes:</strong>
            <DiffBadge status="added" /> new
            <DiffBadge status="modified" /> changed
            <DiffBadge status="removed" /> will retire (Keep to preserve)
          </div>
        )}
        {proposal.notes && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              background: "var(--paper-2)",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--ink-2)",
            }}
          >
            <strong style={{ color: "var(--gold)" }}>AI notes:</strong>{" "}
            {proposal.notes}
          </div>
        )}
      </div>

      {/* Pools */}
      {proposal.pools.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Optional pools — {proposal.pools.length}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 12 }}>
            Each pool defines a "pick N of M" group. Subjects below assign to a
            pool via their dropdown. Edit pick_min/pick_max if the AI's count
            is wrong.
          </div>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-3)" }}>
                <th style={{ padding: "4px 6px" }}>Code</th>
                <th style={{ padding: "4px 6px" }}>Name</th>
                <th style={{ padding: "4px 6px", width: 80 }}>pick_min</th>
                <th style={{ padding: "4px 6px", width: 80 }}>pick_max</th>
              </tr>
            </thead>
            <tbody>
              {proposal.pools.map((pl, i) => (
                <tr key={pl.code} style={{ borderTop: "1px solid var(--rule)" }}>
                  <td style={{ padding: "6px" }}>
                    <code style={{ fontSize: 11, color: "var(--gold)" }}>
                      {pl.code}
                    </code>
                  </td>
                  <td style={{ padding: "6px" }}>
                    <input
                      value={pl.name}
                      onChange={(e) => patchPool(i, { name: e.target.value })}
                      style={inlineInput}
                    />
                  </td>
                  <td style={{ padding: "6px" }}>
                    <input
                      type="number"
                      value={pl.pick_min}
                      onChange={(e) =>
                        patchPool(i, { pick_min: Number(e.target.value) || 0 })
                      }
                      style={{ ...inlineInput, width: 60 }}
                      min={0}
                    />
                  </td>
                  <td style={{ padding: "6px" }}>
                    <input
                      type="number"
                      value={pl.pick_max}
                      onChange={(e) =>
                        patchPool(i, { pick_max: Number(e.target.value) || 1 })
                      }
                      style={{ ...inlineInput, width: 60 }}
                      min={1}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Subjects */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          Subjects — {subjectCount}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 12 }}>
          Toggle each subject's mandatory status. Optional subjects must
          point at a pool (define more pools above if needed).
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {proposal.subjects.map((s, i) => (
            <SubjectRow
              key={s.code}
              subject={s}
              poolOptions={proposal.pools.map((p) => p.code)}
              onPatch={(p) => patchSubject(i, p)}
              onRemove={() => removeSubject(i)}
            />
          ))}
          <button
            type="button"
            onClick={addSubject}
            style={{
              background: "transparent",
              border: "1px dashed var(--rule)",
              borderRadius: 8,
              padding: 10,
              color: "var(--accent)",
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            + Add subject
          </button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button onClick={onBack} className="btn btn-ghost" style={{ padding: "8px 14px" }}>
          ← Back to basics
        </button>
        <button
          onClick={onSave}
          disabled={busy}
          className="btn btn-primary"
          style={{ padding: "8px 18px" }}
        >
          {busy ? "Saving…" : "💾 Save exam to catalog"}
        </button>
      </div>
    </div>
  );
}

function SubjectRow({
  subject,
  poolOptions,
  onPatch,
  onRemove,
}: {
  subject: SubjectDraft;
  poolOptions: string[];
  onPatch: (p: Partial<SubjectDraft>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        border: "1px solid var(--rule)",
        borderRadius: 8,
        padding: 10,
        background: "var(--paper-2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--ink-3)",
            cursor: "pointer",
            fontSize: 11,
            padding: 0,
            width: 18,
          }}
          aria-expanded={open}
        >
          {open ? "▾" : "▸"}
        </button>
        <input
          value={subject.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          style={{ ...inlineInput, fontWeight: 600, flex: 1 }}
        />
        <code style={{ fontSize: 11, color: "var(--gold)" }}>{subject.code}</code>
        <DiffBadge status={subject._status} />
        {subject._status === "removed" &&
          (subject._kept ? (
            <span style={{ fontSize: 10, color: "var(--good)" }}>kept ✓</span>
          ) : (
            <button
              onClick={() => onPatch({ _kept: true })}
              style={{
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 999,
                border: "1px solid var(--good)",
                background: "transparent",
                color: "var(--good)",
                cursor: "pointer",
              }}
            >
              Keep
            </button>
          ))}
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={subject.is_mandatory}
            onChange={(e) =>
              onPatch({
                is_mandatory: e.target.checked,
                pool_code: e.target.checked ? null : subject.pool_code,
              })
            }
          />
          mandatory
        </label>
        {!subject.is_mandatory && (
          <select
            value={subject.pool_code ?? ""}
            onChange={(e) => onPatch({ pool_code: e.target.value || null })}
            style={{ ...inlineInput, width: 160 }}
          >
            <option value="">— pick pool —</option>
            {poolOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <span style={{ fontSize: 10, color: "var(--ink-3)" }}>
          {subject.topics.length} topics
        </span>
        <button
          onClick={onRemove}
          aria-label={`Remove ${subject.name}`}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--bad)",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          ×
        </button>
      </div>
      {open && (
        <div
          style={{
            margin: "10px 0 0",
            padding: "10px 0 0 30px",
            borderTop: "1px solid var(--rule)",
          }}
        >
          {subject.topics.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 8 }}>
              No topics yet. Add one below.
            </div>
          ) : (
            <ol
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {subject.topics.map((t, i) => (
                <li
                  key={`${t.code}-${i}`}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--ink-3)",
                      width: 18,
                      textAlign: "right",
                    }}
                  >
                    {i + 1}.
                  </span>
                  <input
                    value={t.title}
                    onChange={(e) => {
                      const topics = subject.topics.slice();
                      topics[i] = { ...topics[i], title: e.target.value };
                      onPatch({ topics });
                    }}
                    placeholder="Topic title"
                    style={{ ...inlineInput, flex: 1, fontWeight: 500 }}
                  />
                  <input
                    value={t.code}
                    onChange={(e) => {
                      const topics = subject.topics.slice();
                      topics[i] = { ...topics[i], code: e.target.value };
                      onPatch({ topics });
                    }}
                    placeholder="CODE"
                    style={{
                      ...inlineInput,
                      width: 120,
                      fontSize: 11,
                      color: "var(--gold)",
                      fontFamily: "monospace",
                    }}
                  />
                  <DiffBadge status={t._status} />
                  {t._status === "removed" &&
                    (t._kept ? (
                      <span style={{ fontSize: 10, color: "var(--good)" }}>kept ✓</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const topics = subject.topics.slice();
                          topics[i] = { ...topics[i], _kept: true };
                          onPatch({ topics });
                        }}
                        style={{
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "1px solid var(--good)",
                          background: "transparent",
                          color: "var(--good)",
                          cursor: "pointer",
                        }}
                      >
                        Keep
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => {
                      const topics = subject.topics.slice();
                      topics.splice(i, 1);
                      onPatch({ topics });
                    }}
                    aria-label={`Remove topic ${t.title}`}
                    style={{
                      background: "transparent",
                      border: 0,
                      color: "var(--bad)",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
          )}
          <button
            type="button"
            onClick={() => {
              // Pick a unique topic code within this subject.
              const used = new Set(subject.topics.map((t) => t.code));
              let n = 1;
              let code = `NEW_TOPIC_${n}`;
              while (used.has(code)) {
                n += 1;
                code = `NEW_TOPIC_${n}`;
              }
              onPatch({
                topics: [
                  ...subject.topics,
                  { code, title: "New topic", description: null },
                ],
              });
            }}
            style={{
              marginTop: subject.topics.length === 0 ? 0 : 10,
              background: "transparent",
              border: "1px dashed var(--rule)",
              borderRadius: 6,
              padding: "6px 10px",
              color: "var(--accent)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Add topic
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Step 3 — Saved
// ─────────────────────────────────────────────────────────────────

function SavedStep({
  summary,
  seeding,
  seedSummary,
  onSeed,
  onAddAnother,
  onGoExams,
}: {
  summary: {
    examId: string;
    subjectsCreated: number;
    topicsCreated: number;
    poolsCreated: number;
    subjectsRetired?: number;
    topicsRetired?: number;
    poolsRetired?: number;
  };
  seeding: boolean;
  seedSummary: { topics: number; questions: number; failures: number } | null;
  onSeed: (perTopic: number) => void;
  onAddAnother: () => void;
  onGoExams: () => void;
}) {
  const [perTopic, setPerTopic] = useState(5);
  const retired =
    (summary.subjectsRetired ?? 0) +
    (summary.topicsRetired ?? 0) +
    (summary.poolsRetired ?? 0);
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
          Exam saved
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {summary.subjectsCreated} subjects · {summary.topicsCreated} topics ·{" "}
          {summary.poolsCreated} pools
          {retired > 0 && (
            <span style={{ marginLeft: 8, color: "var(--warn)" }}>
              · {retired} retired
            </span>
          )}
        </div>
        <code
          style={{
            fontSize: 11,
            color: "var(--ink-4)",
            display: "block",
            marginTop: 6,
          }}
        >
          exam_id: {summary.examId}
        </code>
      </div>

      {/* Question seeding — admin can ask AI to draft N MCQs per topic
          for the freshly-created (or edited) exam. Seeds land as DRAFT
          in the question bank for review before publish. */}
      <div
        style={{
          padding: 14,
          background: "var(--paper-2)",
          border: "1px solid var(--rule)",
          borderRadius: 8,
          marginBottom: 18,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          🌱 Seed question bank with AI
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 10 }}>
          Generates DRAFT MCQs for each published topic in this exam. Up to
          20 topics + 10 questions per topic per call. Drafts land in the
          regular question-bank for review before publish.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "var(--ink-2)" }}>
            Questions per topic:
            <input
              type="number"
              min={1}
              max={10}
              value={perTopic}
              onChange={(e) => setPerTopic(Math.max(1, Math.min(10, Number(e.target.value) || 5)))}
              style={{
                marginLeft: 8,
                width: 64,
                padding: "4px 8px",
                background: "var(--card)",
                color: "var(--ink)",
                border: "1px solid var(--rule-2)",
                borderRadius: 4,
                fontSize: 12,
              }}
            />
          </label>
          <button
            onClick={() => onSeed(perTopic)}
            disabled={seeding}
            className="btn btn-primary"
            style={{ padding: "6px 14px", fontSize: 12 }}
          >
            {seeding ? "Generating…" : "Seed questions"}
          </button>
          {seedSummary && (
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
              ✓ {seedSummary.questions} questions across {seedSummary.topics} topics
              {seedSummary.failures > 0 && (
                <span style={{ color: "var(--warn)", marginLeft: 6 }}>
                  · {seedSummary.failures} failed
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
        <button onClick={onAddAnother} className="btn btn-ghost" style={{ padding: "8px 14px" }}>
          Add another
        </button>
        <button onClick={onGoExams} className="btn btn-primary" style={{ padding: "8px 14px" }}>
          Done
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Layout helpers
// ─────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--paper-2)",
  border: "1px solid var(--rule-2)",
  borderRadius: 6,
  color: "var(--ink)",
  fontSize: 13,
  outline: "none",
};

const inlineInput: React.CSSProperties = {
  padding: "4px 8px",
  background: "var(--card)",
  border: "1px solid var(--rule)",
  borderRadius: 4,
  color: "var(--ink)",
  fontSize: 12,
  outline: "none",
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label
        style={{
          display: "block",
          fontSize: 11,
          fontWeight: 600,
          marginBottom: 4,
          color: "var(--ink-2)",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
      {children}
    </div>
  );
}

async function safeDetail(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { detail?: { message?: string } | string };
    if (typeof body.detail === "string") return body.detail;
    if (body.detail && typeof body.detail === "object" && body.detail.message)
      return body.detail.message;
  } catch {
    /* not json */
  }
  return null;
}