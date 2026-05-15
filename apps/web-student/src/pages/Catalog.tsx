// Catalog — browse all exams.
//
// Aurora redesign per docs/02-design/redesign/catalog.md.
//
// The catalog API today returns flat exams without stream metadata.
// We do a best-effort client-side grouping based on `code` + `name`
// keywords so users see streams ("Engineering", "Medical", "Civils",
// "School") immediately; the server can later return an authoritative
// `stream` field and we drop the heuristic.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  EmptyState,
  Input,
  Skeleton,
  Tag,
} from "@alp/ui";
import { auth } from "../lib/api";
import { AppShell } from "../components/AppShell";

interface Exam {
  id: string;
  code: string;
  name: string;
  subtitle?: string | null;
}

interface Stream {
  key: string;
  label: string;
  emoji: string;
  match: (e: Exam) => boolean;
}

// Streams in canonical order. First match wins.
const STREAMS: Stream[] = [
  {
    key: "engineering",
    label: "Engineering",
    emoji: "⚛",
    match: (e) =>
      /jee|gate/i.test(e.code) || /jee|gate|engineering/i.test(e.name),
  },
  {
    key: "medical",
    label: "Medical",
    emoji: "🌿",
    match: (e) => /neet/i.test(e.code) || /neet|medical/i.test(e.name),
  },
  {
    key: "civils",
    label: "Civil Services",
    emoji: "🏛",
    match: (e) =>
      /upsc|ssc/i.test(e.code) || /upsc|civil|services/i.test(e.name),
  },
  {
    key: "management",
    label: "Management",
    emoji: "💼",
    match: (e) => /cat|mat|cmat/i.test(e.code) || /cat|mat|mba/i.test(e.name),
  },
  {
    key: "school",
    label: "School",
    emoji: "🎒",
    match: (e) => /cbse|class/i.test(e.code) || /cbse|class /i.test(e.name),
  },
  {
    key: "skills",
    label: "Skills",
    emoji: "🧠",
    match: () => true, // fallback bucket
  },
];

function streamFor(exam: Exam): Stream {
  return STREAMS.find((s) => s.match(exam)) ?? STREAMS[STREAMS.length - 1]!;
}

function groupByStream(exams: Exam[]): Map<string, { stream: Stream; items: Exam[] }> {
  const map = new Map<string, { stream: Stream; items: Exam[] }>();
  for (const s of STREAMS) map.set(s.key, { stream: s, items: [] });
  for (const e of exams) {
    const s = streamFor(e);
    map.get(s.key)!.items.push(e);
  }
  // Drop empty streams so the page doesn't render empty group headers
  for (const [k, v] of [...map.entries()]) {
    if (v.items.length === 0) map.delete(k);
  }
  return map;
}

function ExamCard({ exam }: { exam: Exam }) {
  const stream = streamFor(exam);
  return (
    <Link
      to={`/catalog/exam/${exam.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
      aria-label={`Browse ${exam.name}`}
    >
      <Card interactive padding="md">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span
            aria-hidden
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "var(--brand-50)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            {stream.emoji}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: "var(--neutral-900)" }}>{exam.name}</div>
            {exam.subtitle ? (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--neutral-600)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {exam.subtitle}
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Tag tone="brand" variant="soft" size="sm">
            {exam.code}
          </Tag>
          <span style={{ flex: 1 }} />
          <span
            aria-hidden
            style={{
              color: "var(--brand-600)",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            →
          </span>
        </div>
      </Card>
    </Link>
  );
}

function ExamCardSkeleton() {
  return (
    <Card padding="md">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Skeleton shape="circle" width={40} height={40} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <Skeleton shape="text" width="60%" />
          <Skeleton shape="text" width="40%" />
        </div>
      </div>
    </Card>
  );
}

export function Catalog() {
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await auth.fetch("/api/v1/catalog/exams");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setExams((await res.json()) as Exam[]);
      } catch {
        setError("We couldn't load the exam list.");
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!exams) return null;
    const q = query.trim().toLowerCase();
    if (!q) return exams;
    return exams.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        (e.subtitle ?? "").toLowerCase().includes(q),
    );
  }, [exams, query]);

  const grouped = useMemo(
    () => (filtered ? groupByStream(filtered) : null),
    [filtered],
  );

  return (
    <AppShell title="Catalog">
      <header style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: "var(--t-h1-size)",
            lineHeight: "var(--t-h1-line)",
            fontWeight: 700,
            margin: 0,
            color: "var(--neutral-900)",
          }}
        >
          Browse exams
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--neutral-600)" }}>
          Pick an exam to explore its subjects and topics.
        </p>
      </header>

      <div style={{ maxWidth: 480, marginBottom: 24 }}>
        <Input
          type="search"
          inputMode="search"
          placeholder="Search exams, subjects, topics…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search catalog"
          prefix={<span aria-hidden>🔍</span>}
        />
      </div>

      {error ? (
        <Card tone="aurora-celebration" padding="sm" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </Card>
      ) : null}

      {filtered === null ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          <ExamCardSkeleton />
          <ExamCardSkeleton />
          <ExamCardSkeleton />
          <ExamCardSkeleton />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          illustration={<span aria-hidden>🔎</span>}
          title={query ? `No exams match "${query}"` : "No exams yet"}
          description={
            query
              ? "Try a different keyword, or browse all streams."
              : "Check back once content authoring uploads the first exam."
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {[...grouped!.values()].map(({ stream, items }) => (
            <section key={stream.key} aria-labelledby={`stream-${stream.key}`}>
              <h2
                id={`stream-${stream.key}`}
                style={{
                  fontSize: "var(--t-h3-size)",
                  lineHeight: "var(--t-h3-line)",
                  fontWeight: 600,
                  margin: "0 0 12px",
                  color: "var(--neutral-800)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span aria-hidden>{stream.emoji}</span> {stream.label}
                <Tag tone="neutral" variant="soft" size="sm">
                  {items.length} {items.length === 1 ? "exam" : "exams"}
                </Tag>
              </h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 12,
                }}
              >
                {items.map((e) => (
                  <ExamCard key={e.id} exam={e} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
