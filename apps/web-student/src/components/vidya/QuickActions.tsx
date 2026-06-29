// QuickActions — large hit-target row for the dashboard's main
// "where do I go now?" entry points. Sits between the hero card
// row and the KPI tiles on /home (both single- and multi-exam
// variants).
//
// Spec: docs/02-design/design-system/04_components.md
//       — same card family as the dashboard primitives.

import { Link } from "react-router-dom";

export interface QuickActionsProps {
  /** First enrolled exam ID — drives the Study Map deep-link. */
  firstExamId?: string | null;
  /** Topic ID the planner currently recommends — passed to /practice. */
  nextBestTopicId?: string | null;
}

export function QuickActions({ firstExamId, nextBestTopicId }: QuickActionsProps) {
  // When the host page is exam-scoped (any non-null firstExamId) we
  // append ?examId=… so the destination filters to the same exam.
  // The dashboard's home variant doesn't pass an examId, so the
  // destinations stay un-scoped there.
  const examParam = firstExamId ? `examId=${encodeURIComponent(firstExamId)}` : "";
  const withExam = (path: string, extra = ""): string => {
    const parts = [extra, examParam].filter(Boolean).join("&");
    return parts ? `${path}?${parts}` : path;
  };

  const practiceHref = withExam(
    "/practice",
    nextBestTopicId ? `topic=${encodeURIComponent(nextBestTopicId)}` : "",
  );
  const mockHref = withExam("/mocks");
  const studyHref = firstExamId ? `/study/${firstExamId}` : "/study-map";
  const expertsHref = withExam("/experts");
  // Study Materials hub is exam-scoped via a PATH param (not a query),
  // so it's built explicitly rather than via withExam().
  const contentHref = firstExamId ? `/exams/${firstExamId}/content` : "/exams/add";

  const items: Array<{
    href: string;
    icon: string;
    iconTone: "accent" | "gold" | "info" | "warn";
    title: string;
    body: string;
    cta: string;
  }> = [
    {
      href: practiceHref,
      icon: "⚡",
      iconTone: "gold",
      title: "AI practice",
      body: "10–15 minutes of θ-tuned questions on your weakest topic.",
      cta: "Start session →",
    },
    {
      href: mockHref,
      icon: "◎",
      iconTone: "info",
      title: "Mock tests",
      body: "Full-length adaptive tests · 30–180 min · scored like exam day.",
      cta: "Take a mock →",
    },
    {
      href: studyHref,
      icon: "📖",
      iconTone: "accent",
      title: "Study map",
      body: "Browse every chapter by mastery. Pick what to refresh.",
      cta: "Open map →",
    },
    {
      href: expertsHref,
      icon: "✦",
      iconTone: "warn",
      title: "Ask Vidya",
      body: "Stuck on a problem? Drop a photo or text — AI drafts, expert verifies.",
      cta: "Open doubts →",
    },
    {
      href: contentHref,
      icon: "📚",
      iconTone: "accent",
      title: "Study materials",
      body: "Videos, notes & PDFs for every topic — organized by subject.",
      cta: "Open hub →",
    },
  ];

  return (
    <section className="vidya-quick" aria-label="Jump in">
      <div className="vidya-quick__head">
        <span className="vidya-quick__eyebrow">Jump in</span>
        <span className="vidya-quick__sub">
          Pick the surface that matches your next 20 minutes.
        </span>
      </div>
      <div className="vidya-quick__grid">
        {items.map((it) => (
          <Link key={it.href} to={it.href} className="vidya-quick__card">
            <span
              className={`vidya-quick__icon vidya-quick__icon--${it.iconTone}`}
              aria-hidden
            >
              {it.icon}
            </span>
            <div className="vidya-quick__title">{it.title}</div>
            <p className="vidya-quick__body">{it.body}</p>
            <span className="vidya-quick__cta">{it.cta}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
