// Tutor application page — production-grade redesign (2026-05-11).
//
// Layout: pg-shell → pg-header → four pg-section panels
//   1. Profile — display name / headline / bio (textarea) / hourly rate
//   2. Qualifications — repeatable cards (kind / title / institution / year)
//   3. Weekly availability — repeatable cards (day / start / end)
//   4. Topics you teach — selected-chip list at top + picker below.
//      Selected chips persist across exam/subject switches so a tutor
//      can teach across multiple subjects in one go.
//
// API contract unchanged — same applyAsTutor() call.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import {
  type CatalogExam,
  type CatalogSubject,
  type CatalogTopic,
  type TutorAvailability,
  type TutorQualification,
  catalog,
  marketplace,
} from "../lib/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const QUAL_KINDS: TutorQualification["kind"][] = [
  "DEGREE",
  "CERTIFICATE",
  "EXAM_RANK",
  "TEACHING_EXPERIENCE",
];

const QUAL_LABEL: Record<TutorQualification["kind"], string> = {
  DEGREE: "Degree",
  CERTIFICATE: "Certificate",
  EXAM_RANK: "Exam rank",
  TEACHING_EXPERIENCE: "Teaching experience",
};

function rupeesToPaise(rs: number): number {
  return Math.round(rs * 100);
}

function formatTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function TutorApply() {
  const nav = useNavigate();

  // ---------- form state ----------
  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [rateRs, setRateRs] = useState<number>(500);
  const [quals, setQuals] = useState<TutorQualification[]>([
    { kind: "DEGREE", title: "" },
  ]);
  const [avail, setAvail] = useState<TutorAvailability[]>([
    { dayOfWeek: 1, startMinute: 18 * 60, endMinute: 21 * 60 },
  ]);
  const [topicIds, setTopicIds] = useState<string[]>([]);
  // Remember title/subject for every topic the tutor has ever selected,
  // so we can render the selected-chip list even after the picker
  // switches to a different subject and the original `topics` array
  // is replaced.
  const [topicMeta, setTopicMeta] = useState<
    Record<string, { title: string; subjectName: string; examName: string }>
  >({});

  // ---------- catalog drill-down ----------
  const [exams, setExams] = useState<CatalogExam[]>([]);
  const [examId, setExamId] = useState<string>("");
  const [subjects, setSubjects] = useState<CatalogSubject[]>([]);
  const [subjectId, setSubjectId] = useState<string>("");
  const [topics, setTopics] = useState<CatalogTopic[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    catalog.myExams().then(setExams).catch(() => setExams([]));
  }, []);
  useEffect(() => {
    if (!examId) {
      setSubjects([]);
      setSubjectId("");
      return;
    }
    catalog.mySubjects(examId).then(setSubjects).catch(() => setSubjects([]));
  }, [examId]);
  useEffect(() => {
    if (!subjectId) {
      setTopics([]);
      return;
    }
    catalog.topics(subjectId).then(setTopics).catch(() => setTopics([]));
  }, [subjectId]);

  const currentExam = useMemo(
    () => exams.find((e) => e.id === examId),
    [exams, examId],
  );
  const currentSubject = useMemo(
    () => subjects.find((s) => s.id === subjectId),
    [subjects, subjectId],
  );

  function toggleTopic(t: CatalogTopic) {
    setTopicIds((curr) =>
      curr.includes(t.id) ? curr.filter((x) => x !== t.id) : [...curr, t.id],
    );
    setTopicMeta((prev) => ({
      ...prev,
      [t.id]: {
        title: t.title,
        subjectName: currentSubject?.name ?? "",
        examName: currentExam?.name ?? "",
      },
    }));
  }

  function removeTopic(id: string) {
    setTopicIds((curr) => curr.filter((x) => x !== id));
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await marketplace.applyAsTutor({
        displayName,
        headline,
        bio,
        hourlyRatePaise: rupeesToPaise(rateRs),
        qualifications: quals.filter((q) => q.title.trim()),
        availability: avail,
        topicIds,
      });
      nav("/tutor");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !submitting &&
    !!displayName.trim() &&
    !!headline.trim() &&
    rateRs >= 100 &&
    rateRs <= 5000 &&
    avail.length > 0;

  return (
    <AppShell
      title="Apply to be a tutor"
      actions={
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="pg-btn pg-btn-primary"
        >
          {submitting ? "Submitting…" : "Submit application →"}
        </button>
      }
    >
      <div className="pg-shell" style={{ maxWidth: 1080 }}>
        <header className="pg-header">
          <div className="pg-header-main">
            <h1 className="pg-header-title">Apply to be a tutor</h1>
            <p className="pg-header-sub">
              Per ADR-0008, hourly rate must be between ₹100 and ₹5,000.
              Premium-tier rates require manual review. Add a profile, your
              weekly availability, and the topics you can teach — students
              find you by filtering on any of these.
            </p>
          </div>
        </header>

        {error && (
          <div style={{ marginBottom: 14 }}>
            <p className="banner banner-error">{error}</p>
          </div>
        )}

        {/* ── 1. Profile ──────────────────────────────────────── */}
        <section className="pg-section">
          <h2 className="pg-section-title">
            Profile
            <span className="pg-section-title-sub">
              Public on the marketplace
            </span>
          </h2>
          <div className="pg-fields">
            <div>
              <div className="pg-field-label">Display name *</div>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={120}
                placeholder="e.g. Dr. Priya Sharma"
                style={fieldInputStyle}
              />
            </div>
            <div>
              <div className="pg-field-label">Headline *</div>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                required
                maxLength={240}
                placeholder="e.g. JEE Main Physics · 8 yrs experience"
                style={fieldInputStyle}
              />
            </div>
            <div>
              <div className="pg-field-label">Hourly rate (₹) *</div>
              <input
                type="number"
                min={100}
                max={5000}
                value={rateRs}
                onChange={(e) => setRateRs(parseInt(e.target.value || "0", 10))}
                style={fieldInputStyle}
              />
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-faint)",
                  marginTop: 4,
                }}
              >
                {rupeesToPaise(rateRs).toLocaleString("en-IN")} paise · ₹100–₹5,000
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="pg-field-label">Bio</div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={4000}
              rows={4}
              placeholder="Optional longer description shown on your profile page. Mention teaching style, what students typically achieve with you, and your standout result."
              style={{
                ...fieldInputStyle,
                width: "100%",
                resize: "vertical",
                fontFamily: "inherit",
                lineHeight: 1.55,
              }}
            />
            <div
              style={{
                fontSize: 11,
                color: "var(--text-faint)",
                marginTop: 4,
              }}
            >
              {bio.length} / 4,000 characters
            </div>
          </div>
        </section>

        {/* ── 2. Qualifications ──────────────────────────────── */}
        <section className="pg-section">
          <h2 className="pg-section-title">
            Qualifications
            <span className="pg-section-title-sub">
              {quals.length} entr{quals.length === 1 ? "y" : "ies"}
            </span>
          </h2>
          {quals.map((q, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(150px, 180px) minmax(0, 1.5fr) minmax(0, 1.5fr) 110px auto",
                gap: 10,
                alignItems: "end",
                marginBottom: 10,
                padding: 12,
                background: "var(--bg-surface3)",
                border: "1px solid var(--border)",
                borderRadius: 6,
              }}
            >
              <div>
                <div className="pg-field-label">Kind</div>
                <select
                  value={q.kind}
                  onChange={(e) => {
                    const nq = [...quals];
                    nq[i] = {
                      ...q,
                      kind: e.target.value as TutorQualification["kind"],
                    };
                    setQuals(nq);
                  }}
                  style={fieldInputStyle}
                >
                  {QUAL_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {QUAL_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="pg-field-label">Title</div>
                <input
                  type="text"
                  placeholder="e.g. B.Tech · IIT JEE AIR 87 · CBSE Topper"
                  value={q.title}
                  onChange={(e) => {
                    const nq = [...quals];
                    nq[i] = { ...q, title: e.target.value };
                    setQuals(nq);
                  }}
                  style={fieldInputStyle}
                />
              </div>
              <div>
                <div className="pg-field-label">Institution / Issuer</div>
                <input
                  type="text"
                  placeholder="Optional"
                  value={q.institution ?? ""}
                  onChange={(e) => {
                    const nq = [...quals];
                    nq[i] = { ...q, institution: e.target.value || null };
                    setQuals(nq);
                  }}
                  style={fieldInputStyle}
                />
              </div>
              <div>
                <div className="pg-field-label">Year</div>
                <input
                  type="number"
                  placeholder="2018"
                  value={q.yearCompleted ?? ""}
                  onChange={(e) => {
                    const nq = [...quals];
                    nq[i] = {
                      ...q,
                      yearCompleted: e.target.value
                        ? parseInt(e.target.value, 10)
                        : null,
                    };
                    setQuals(nq);
                  }}
                  style={fieldInputStyle}
                />
              </div>
              <button
                type="button"
                onClick={() => setQuals(quals.filter((_, j) => j !== i))}
                disabled={quals.length === 1}
                className="pg-btn pg-btn-ghost pg-btn-sm"
                style={{ height: 34 }}
                title="Remove this qualification"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setQuals([...quals, { kind: "DEGREE", title: "" }])
            }
            className="pg-btn pg-btn-subtle"
          >
            ＋ Add qualification
          </button>
        </section>

        {/* ── 3. Weekly availability ─────────────────────────── */}
        <section className="pg-section">
          <h2 className="pg-section-title">
            Weekly availability
            <span className="pg-section-title-sub">
              {avail.length} window{avail.length === 1 ? "" : "s"}
            </span>
          </h2>
          {avail.map((a, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr 1fr auto",
                gap: 10,
                alignItems: "end",
                marginBottom: 10,
                padding: 12,
                background: "var(--bg-surface3)",
                border: "1px solid var(--border)",
                borderRadius: 6,
              }}
            >
              <div>
                <div className="pg-field-label">Day</div>
                <select
                  value={a.dayOfWeek}
                  onChange={(e) => {
                    const na = [...avail];
                    na[i] = { ...a, dayOfWeek: parseInt(e.target.value, 10) };
                    setAvail(na);
                  }}
                  style={fieldInputStyle}
                >
                  {DAYS.map((d, idx) => (
                    <option key={d} value={idx}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="pg-field-label">Start time</div>
                <input
                  type="time"
                  value={formatTime(a.startMinute)}
                  onChange={(e) => {
                    const [h, m] = e.target.value
                      .split(":")
                      .map((x) => parseInt(x, 10));
                    const na = [...avail];
                    na[i] = { ...a, startMinute: h * 60 + m };
                    setAvail(na);
                  }}
                  style={fieldInputStyle}
                />
              </div>
              <div>
                <div className="pg-field-label">End time</div>
                <input
                  type="time"
                  value={formatTime(a.endMinute)}
                  onChange={(e) => {
                    const [h, m] = e.target.value
                      .split(":")
                      .map((x) => parseInt(x, 10));
                    const na = [...avail];
                    na[i] = { ...a, endMinute: h * 60 + m };
                    setAvail(na);
                  }}
                  style={fieldInputStyle}
                />
              </div>
              <button
                type="button"
                onClick={() => setAvail(avail.filter((_, j) => j !== i))}
                disabled={avail.length === 1}
                className="pg-btn pg-btn-ghost pg-btn-sm"
                style={{ height: 34 }}
                title="Remove this window"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setAvail([
                ...avail,
                { dayOfWeek: 0, startMinute: 18 * 60, endMinute: 21 * 60 },
              ])
            }
            className="pg-btn pg-btn-subtle"
          >
            ＋ Add availability window
          </button>
          <p
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: 8,
              lineHeight: 1.5,
            }}
          >
            Times are in your local timezone. Students see slots converted to
            their own timezone when booking.
          </p>
        </section>

        {/* ── 4. Topics you teach ────────────────────────────── */}
        <section className="pg-section">
          <h2 className="pg-section-title">
            Topics you teach
            <span className="pg-section-title-sub">
              {topicIds.length} selected
            </span>
          </h2>

          {/* Selected-chip list — persists across exam/subject switches.
              Add new topics by picking exam → subject → checking topics
              below; remove from the chip list with the × button. */}
          {topicIds.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 16,
                padding: 12,
                background:
                  "linear-gradient(135deg, rgba(16,196,122,0.06), rgba(16,196,122,0.02))",
                border: "1px solid rgba(16,196,122,0.25)",
                borderRadius: 6,
              }}
            >
              {topicIds.map((id) => {
                const m = topicMeta[id];
                return (
                  <span
                    key={id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 8px 5px 12px",
                      background: "var(--bg-surface2)",
                      border: "1px solid var(--border)",
                      borderRadius: 999,
                      fontSize: 12,
                      color: "var(--text-primary)",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {m?.title ?? id.slice(0, 8)}
                    </span>
                    {m?.subjectName && (
                      <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                        · {m.subjectName}
                        {m.examName ? ` · ${m.examName}` : ""}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeTopic(id)}
                      title="Remove topic"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        fontSize: 14,
                        padding: 0,
                        marginLeft: 2,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                padding: 12,
                marginBottom: 16,
                background: "var(--bg-surface3)",
                border: "1px dashed var(--border-strong)",
                borderRadius: 6,
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              No topics selected yet — pick an exam + subject below and check
              one or more topics to add them. You can teach across multiple
              exams and subjects.
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div>
              <div className="pg-field-label">Exam</div>
              <select
                value={examId}
                onChange={(e) => setExamId(e.target.value)}
                style={fieldInputStyle}
              >
                <option value="">— Pick exam —</option>
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="pg-field-label">Subject</div>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                disabled={!examId}
                style={fieldInputStyle}
              >
                <option value="">— Pick subject —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {topics.length > 0 && (
            <>
              <div className="pg-field-label" style={{ marginBottom: 8 }}>
                Topics in {currentSubject?.name ?? "this subject"}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                {topics.map((t) => {
                  const checked = topicIds.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 12px",
                        background: checked
                          ? "rgba(16,196,122,0.08)"
                          : "var(--bg-surface3)",
                        border: `1px solid ${checked ? "rgba(16,196,122,0.30)" : "var(--border)"}`,
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 13,
                        color: "var(--text-primary)",
                        transition: "background var(--trans-fast)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTopic(t)}
                        style={{ flexShrink: 0 }}
                      />
                      <span style={{ flex: 1 }}>{t.title}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {subjectId && topics.length === 0 && (
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                marginTop: 8,
              }}
            >
              No topics available under this subject yet.
            </p>
          )}
        </section>

        {/* Footer submit (in addition to the topbar action) */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 8,
          }}
        >
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="pg-btn pg-btn-primary"
          >
            {submitting ? "Submitting…" : "Submit application →"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}

// Shared inline-input style used across this form. Picks up tokens
// so it auto-themes; `box-sizing: border-box` keeps the grid honest.
const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  background: "var(--bg-surface2)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};
