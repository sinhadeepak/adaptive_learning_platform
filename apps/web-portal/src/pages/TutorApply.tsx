// Sprint 16 (P3-S1) — Tutor application page.
//
// Minimal viable UI:
//   - Form: display name, headline, bio, hourly rate (₹/hr → paise),
//     qualifications (repeatable rows), availability (repeatable rows
//     keyed by day of week), topic checkboxes (loaded from /catalog).
//   - On submit: POST /marketplace/tutors/apply, redirect to /tutor.
//
// Polish — drag-drop reorder, calendar-grid availability picker,
// inline KYC iframe — is P3-S2.

import { useEffect, useState } from "react";
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

function rupeesToPaise(rs: number): number {
  return Math.round(rs * 100);
}

export function TutorApply() {
  const nav = useNavigate();

  // ---------- form state ----------
  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [rateRs, setRateRs] = useState<number>(500); // ₹500/hr default
  const [quals, setQuals] = useState<TutorQualification[]>([
    { kind: "DEGREE", title: "" },
  ]);
  const [avail, setAvail] = useState<TutorAvailability[]>([
    { dayOfWeek: 1, startMinute: 18 * 60, endMinute: 21 * 60 },
  ]);
  const [topicIds, setTopicIds] = useState<string[]>([]);

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
    if (!examId) return;
    catalog.mySubjects(examId).then(setSubjects).catch(() => setSubjects([]));
  }, [examId]);
  useEffect(() => {
    if (!subjectId) return;
    catalog.topics(subjectId).then(setTopics).catch(() => setTopics([]));
  }, [subjectId]);

  function toggleTopic(id: string) {
    setTopicIds((curr) =>
      curr.includes(id) ? curr.filter((t) => t !== id) : [...curr, id],
    );
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

  return (
    <AppShell title="Apply to be a Tutor">
      <main className="page" style={{ padding: 24, maxWidth: 760 }}>
        <h1>Tutor application</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>
          Per ADR-0008, hourly rate must be between ₹100 and ₹5,000. Premium-tier
          rates require manual review. This UI is the P3-S1 minimum viable form;
          the polished version arrives in P3-S2.
        </p>

        {error && <p className="banner banner-error">{error}</p>}

        <fieldset style={{ marginBottom: 16 }}>
          <legend>Profile</legend>
          <label>
            Display name{" "}
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label>
            Headline{" "}
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              required
              maxLength={240}
              placeholder="e.g. JEE Main Physics, 8 yrs"
            />
          </label>
          <label>
            Bio
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={4000}
              rows={4}
              placeholder="Optional longer-form description shown on your profile page."
            />
          </label>
          <label>
            Hourly rate (₹){" "}
            <input
              type="number"
              min={100}
              max={5000}
              value={rateRs}
              onChange={(e) => setRateRs(parseInt(e.target.value || "0", 10))}
            />{" "}
            <small>= {rupeesToPaise(rateRs).toLocaleString()} paise</small>
          </label>
        </fieldset>

        <fieldset style={{ marginBottom: 16 }}>
          <legend>Qualifications</legend>
          {quals.map((q, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "150px 1fr 1fr 100px 60px", gap: 8, marginBottom: 8 }}>
              <select
                value={q.kind}
                onChange={(e) => {
                  const nq = [...quals];
                  nq[i] = { ...q, kind: e.target.value as TutorQualification["kind"] };
                  setQuals(nq);
                }}
              >
                {QUAL_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Title (e.g. BTech)"
                value={q.title}
                onChange={(e) => {
                  const nq = [...quals];
                  nq[i] = { ...q, title: e.target.value };
                  setQuals(nq);
                }}
              />
              <input
                type="text"
                placeholder="Institution (optional)"
                value={q.institution ?? ""}
                onChange={(e) => {
                  const nq = [...quals];
                  nq[i] = { ...q, institution: e.target.value || null };
                  setQuals(nq);
                }}
              />
              <input
                type="number"
                placeholder="Year"
                value={q.yearCompleted ?? ""}
                onChange={(e) => {
                  const nq = [...quals];
                  nq[i] = {
                    ...q,
                    yearCompleted: e.target.value ? parseInt(e.target.value, 10) : null,
                  };
                  setQuals(nq);
                }}
              />
              <button
                type="button"
                onClick={() => setQuals(quals.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setQuals([...quals, { kind: "DEGREE", title: "" }])}
          >
            + Add qualification
          </button>
        </fieldset>

        <fieldset style={{ marginBottom: 16 }}>
          <legend>Weekly availability</legend>
          {avail.map((a, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr 60px", gap: 8, marginBottom: 8 }}>
              <select
                value={a.dayOfWeek}
                onChange={(e) => {
                  const na = [...avail];
                  na[i] = { ...a, dayOfWeek: parseInt(e.target.value, 10) };
                  setAvail(na);
                }}
              >
                {DAYS.map((d, idx) => (
                  <option key={d} value={idx}>
                    {d}
                  </option>
                ))}
              </select>
              <label>
                Start{" "}
                <input
                  type="time"
                  value={`${String(Math.floor(a.startMinute / 60)).padStart(2, "0")}:${String(a.startMinute % 60).padStart(2, "0")}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map((x) => parseInt(x, 10));
                    const na = [...avail];
                    na[i] = { ...a, startMinute: h * 60 + m };
                    setAvail(na);
                  }}
                />
              </label>
              <label>
                End{" "}
                <input
                  type="time"
                  value={`${String(Math.floor(a.endMinute / 60)).padStart(2, "0")}:${String(a.endMinute % 60).padStart(2, "0")}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map((x) => parseInt(x, 10));
                    const na = [...avail];
                    na[i] = { ...a, endMinute: h * 60 + m };
                    setAvail(na);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => setAvail(avail.filter((_, j) => j !== i))}
              >
                ×
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
          >
            + Add window
          </button>
        </fieldset>

        <fieldset style={{ marginBottom: 16 }}>
          <legend>Topics you teach</legend>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <select value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">— Pick exam —</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              disabled={!examId}
            >
              <option value="">— Pick subject —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {topics.map((t) => (
              <label key={t.id} style={{ display: "flex", gap: 4 }}>
                <input
                  type="checkbox"
                  checked={topicIds.includes(t.id)}
                  onChange={() => toggleTopic(t.id)}
                />
                {t.title}
              </label>
            ))}
          </div>
          {topicIds.length > 0 && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
              {topicIds.length} topic{topicIds.length === 1 ? "" : "s"} selected
            </p>
          )}
        </fieldset>

        <button
          type="button"
          onClick={submit}
          disabled={submitting || !displayName || !headline}
          className="btn-primary"
        >
          {submitting ? "Submitting…" : "Submit application"}
        </button>
      </main>
    </AppShell>
  );
}
