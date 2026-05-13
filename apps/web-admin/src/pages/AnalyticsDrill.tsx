// Phase 7 (P7-A1) — six-level hierarchical drill page.
//
// Tenant → Exam → Subject → Topic → Concept → Student
//
// One page handles all six levels via the URL — query params drive
// which "frame" is showing. Platform admin lands on the tenant list;
// institute admin auto-skips past the tenant frame to their exams.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { Banner } from "../components/primitives";
import {
  BloomMatrix,
  ColdStartProjection,
  DrillDownTable,
  HierarchyBreadcrumb,
  ImportancePill,
  MasteryBar,
  StatTile,
} from "../components/stats";
import { tenants as tenantsApi, type AdminTenantListEntry } from "../lib/api";
import {
  drill,
  type DrillConceptRow,
  type DrillExamRow,
  type DrillStudentRow,
  type DrillSubjectRow,
  type DrillTenantRow,
  type DrillTopicRow,
} from "../lib/drill-api";

type Level = "tenants" | "exams" | "subjects" | "topics" | "concepts" | "students";

export function AnalyticsDrill() {
  const [params, setParams] = useSearchParams();

  const tenant = params.get("tenant") ?? "";
  const exam = params.get("exam") ?? "";
  const subject = params.get("subject") ?? "";
  const topic = params.get("topic") ?? "";

  const level: Level = topic
    ? params.get("students") === "1"
      ? "students"
      : "concepts"
    : subject
    ? "topics"
    : exam
    ? "subjects"
    : tenant
    ? "exams"
    : "tenants";

  const [error, setError] = useState<string | null>(null);
  const [tenantList, setTenantList] = useState<AdminTenantListEntry[]>([]);
  const [tenantData, setTenantData] = useState<DrillTenantRow[] | null>(null);
  const [exams, setExams] = useState<DrillExamRow[] | null>(null);
  const [subjects, setSubjects] = useState<DrillSubjectRow[] | null>(null);
  const [topics, setTopics] = useState<DrillTopicRow[] | null>(null);
  const [concepts, setConcepts] = useState<DrillConceptRow[] | null>(null);
  const [students, setStudents] = useState<DrillStudentRow[] | null>(null);
  const [coldStart, setColdStart] = useState<boolean>(false);
  const [projection, setProjection] = useState<unknown>(null);

  // Tenant lookup table (id → name) for the breadcrumb
  useEffect(() => {
    tenantsApi.list({ limit: 200 }).then((r) => setTenantList(r.items)).catch(() => undefined);
  }, []);

  const tenantName = useMemo(
    () => tenantList.find((t) => t.id === tenant)?.name ?? tenant.slice(0, 8),
    [tenantList, tenant],
  );

  // Fetch the relevant level on URL change
  useEffect(() => {
    setError(null);
    setColdStart(false);
    setProjection(null);
    let cancelled = false;
    (async () => {
      try {
        if (level === "tenants") {
          const r = await drill.tenants();
          if (!cancelled) {
            setTenantData(r.tenants);
            if (r.coldStart) {
              setColdStart(true);
              setProjection(r.projection);
            }
          }
        } else if (level === "exams" && tenant) {
          const r = await drill.exams(tenant);
          if (!cancelled) {
            setExams(r.exams);
            if (r.coldStart) {
              setColdStart(true);
              setProjection(r.projection);
            }
          }
        } else if (level === "subjects" && tenant && exam) {
          const r = await drill.subjects(tenant, exam, true);
          if (!cancelled) setSubjects(r.subjects);
        } else if (level === "topics" && tenant && exam && subject) {
          const r = await drill.topics(tenant, exam, subject, true);
          if (!cancelled) setTopics(r.topics);
        } else if (level === "concepts" && tenant && exam && subject && topic) {
          const r = await drill.concepts(tenant, exam, subject, topic);
          if (!cancelled) setConcepts(r.concepts);
        } else if (level === "students" && tenant && exam && topic) {
          const r = await drill.students(tenant, exam, topic);
          if (!cancelled) setStudents(r.students);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [level, tenant, exam, subject, topic]);

  function go(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next);
  }

  const breadcrumb: { label: string; href?: string; icon?: string }[] = [
    {
      label: "Tenants",
      href: "?",
      icon: "🏢",
    },
  ];
  if (tenant)
    breadcrumb.push({
      label: tenantName,
      href: `?tenant=${encodeURIComponent(tenant)}`,
      icon: "🏛",
    });
  if (exam)
    breadcrumb.push({
      label: exams?.find((e) => e.examId === exam)?.examName ?? exam.slice(0, 8),
      href: `?tenant=${encodeURIComponent(tenant)}&exam=${encodeURIComponent(exam)}`,
      icon: "📋",
    });
  if (subject)
    breadcrumb.push({
      label: subjects?.find((s) => s.subjectId === subject)?.subjectName ?? subject.slice(0, 8),
      href: `?tenant=${encodeURIComponent(tenant)}&exam=${encodeURIComponent(exam)}&subject=${encodeURIComponent(subject)}`,
      icon: "📘",
    });
  if (topic)
    breadcrumb.push({
      label: topics?.find((t) => t.topicId === topic)?.topicTitle ?? topic.slice(0, 8),
      href: `?tenant=${encodeURIComponent(tenant)}&exam=${encodeURIComponent(exam)}&subject=${encodeURIComponent(subject)}&topic=${encodeURIComponent(topic)}`,
      icon: "📍",
    });
  if (level === "students")
    breadcrumb.push({ label: "Students", icon: "👥" });

  return (
    <AppShell title="Analytics drill" chips={[{ label: "Phase 7" }]}>
      <div style={{ padding: "16px 24px 32px" }}>
        <HierarchyBreadcrumb levels={breadcrumb} />

        {error && <Banner tone="danger">{error}</Banner>}

        {coldStart && projection != null && (
          <div style={{ marginBottom: 16 }}>
            <ColdStartProjection projection={projection as never} />
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          {level === "tenants" && (
            <DrillDownTable
              loading={tenantData == null}
              rows={(tenantData ?? []).map((t) => ({
                ...t,
                name:
                  tenantList.find((x) => x.id === t.tenant_id)?.name ??
                  t.tenant_id.slice(0, 8),
              }))}
              columns={[
                { key: "name", label: "Tenant" },
                {
                  key: "avg_ewa",
                  label: "Avg readiness",
                  render: (r) => <MasteryBar ewa={r.avg_ewa as number} />,
                },
                {
                  key: "avg_weak_pct",
                  label: "Weak %",
                  render: (r) =>
                    `${((r.avg_weak_pct as number) * 100).toFixed(0)}%`,
                  align: "right",
                },
                {
                  key: "n_students_topic_sum",
                  label: "Activity",
                  render: (r) =>
                    `${r.n_students_topic_sum} student-topic rows`,
                  align: "right",
                },
                {
                  key: "last_activity",
                  label: "Last activity",
                  render: (r) =>
                    r.last_activity
                      ? new Date(r.last_activity as string).toLocaleDateString()
                      : "—",
                  align: "right",
                },
              ]}
              onRowClick={(r) =>
                go({ tenant: r.tenant_id as string })
              }
              emptyText="No tenants with activity yet."
            />
          )}

          {level === "exams" && (
            <DrillDownTable
              loading={exams == null}
              rows={exams ?? []}
              columns={[
                { key: "examName", label: "Exam" },
                { key: "examCode", label: "Code" },
                { key: "studentCount", label: "Students", align: "right" },
                {
                  key: "avgReadiness",
                  label: "Avg readiness",
                  render: (r) => <MasteryBar ewa={r.avgReadiness} />,
                },
              ]}
              onRowClick={(r) => go({ exam: r.examId })}
              emptyText="No exam activity in this tenant."
            />
          )}

          {level === "subjects" && (
            <DrillDownTable
              loading={subjects == null}
              rows={subjects ?? []}
              columns={[
                { key: "subjectName", label: "Subject" },
                { key: "topicCount", label: "Topics", align: "right" },
                { key: "studentCount", label: "Students", align: "right" },
                {
                  key: "avgReadiness",
                  label: "Avg readiness",
                  render: (r) => <MasteryBar ewa={r.avgReadiness} />,
                },
                {
                  key: "importanceWeightedReadiness",
                  label: "Importance-weighted",
                  render: (r) => (
                    <MasteryBar ewa={r.importanceWeightedReadiness} />
                  ),
                },
                {
                  key: "weakPct",
                  label: "Weak %",
                  render: (r) => `${(r.weakPct * 100).toFixed(0)}%`,
                  align: "right",
                },
              ]}
              onRowClick={(r) => go({ subject: r.subjectId })}
              emptyText="No subject data."
            />
          )}

          {level === "topics" && (
            <DrillDownTable
              loading={topics == null}
              rows={topics ?? []}
              columns={[
                { key: "topicTitle", label: "Topic" },
                {
                  key: "importance",
                  label: "Importance",
                  render: (r) =>
                    r.importance ? <ImportancePill {...r.importance} /> : "—",
                },
                { key: "studentCount", label: "Students", align: "right" },
                {
                  key: "avgReadiness",
                  label: "Avg readiness",
                  render: (r) => <MasteryBar ewa={r.avgReadiness} />,
                },
                {
                  key: "weakPct",
                  label: "Weak %",
                  render: (r) => `${(r.weakPct * 100).toFixed(0)}%`,
                  align: "right",
                },
              ]}
              onRowClick={(r) => go({ topic: r.topicId })}
              emptyText="No topics with activity in this subject."
            />
          )}

          {level === "concepts" && (
            <>
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <button
                  onClick={() => go({ students: "1" })}
                  style={{
                    padding: "6px 14px",
                    background: "var(--color-blue)",
                    color: "white",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  View student list →
                </button>
              </div>
              <DrillDownTable
                loading={concepts == null}
                rows={concepts ?? []}
                columns={[
                  { key: "conceptTitle", label: "Concept" },
                  { key: "studentCount", label: "Students", align: "right" },
                  {
                    key: "avgReadiness",
                    label: "Avg readiness",
                    render: (r) => <MasteryBar ewa={r.avgReadiness} />,
                  },
                  {
                    key: "bloomMatrix",
                    label: "Bloom levels (R / U / A / Z)",
                    render: (r) => (
                      <BloomMatrix
                        cells={r.bloomMatrix as Record<string, { avgEwa: number; n: number }>}
                      />
                    ),
                  },
                ]}
                emptyText="No concept-grain data for this topic yet."
              />
            </>
          )}

          {level === "students" && (
            <DrillDownTable
              loading={students == null}
              rows={students ?? []}
              columns={[
                { key: "userId", label: "Student" },
                {
                  key: "ewa",
                  label: "Mastery",
                  render: (r) => (
                    <MasteryBar ewa={Number(r.ewa)} n={Number(r.n)} />
                  ),
                },
                { key: "n", label: "Attempts", align: "right" },
                {
                  key: "isWeak",
                  label: "Status",
                  render: (r) =>
                    r.isWeak ? (
                      <span
                        style={{
                          color: "var(--color-red, #f43f5e)",
                          fontWeight: 600,
                        }}
                      >
                        Weak
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-green, #10C47A)" }}>
                        OK
                      </span>
                    ),
                },
                {
                  key: "lastActiveAt",
                  label: "Last active",
                  render: (r) =>
                    r.lastActiveAt
                      ? new Date(String(r.lastActiveAt)).toLocaleDateString()
                      : "—",
                  align: "right",
                },
              ]}
              emptyText="No students have attempted this topic yet."
            />
          )}
        </div>

        <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatTile
            label="Drill level"
            value={level.toUpperCase()}
            tone="neutral"
          />
          {tenantData && level === "tenants" && (
            <StatTile label="Tenants" value={tenantData.length} tone="good" />
          )}
          {exams && level === "exams" && (
            <StatTile label="Exams" value={exams.length} tone="good" />
          )}
          {subjects && level === "subjects" && (
            <StatTile
              label="Subjects"
              value={subjects.length}
              tone="good"
            />
          )}
          {topics && level === "topics" && (
            <StatTile label="Topics" value={topics.length} tone="good" />
          )}
          {concepts && level === "concepts" && (
            <StatTile
              label="Concepts"
              value={concepts.length}
              tone="good"
            />
          )}
          {students && level === "students" && (
            <>
              <StatTile
                label="Students"
                value={students.length}
                tone="good"
              />
              <StatTile
                label="Weak"
                value={students.filter((s) => s.isWeak).length}
                tone="bad"
              />
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
