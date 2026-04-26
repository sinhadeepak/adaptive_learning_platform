import { PhaseTwoStub } from "../components/PhaseTwoStub";

export function Analytics() {
  return (
    <PhaseTwoStub
      topbarTitle="Analytics"
      pillLabel="◈ BATCH ANALYTICS"
      heroTitle="4-week trend · subject heat · AI forecast"
      heroSubtitle={
        <>
          Per <code>docs/ui/04_TeacherPortal/15_batch-analytics.html</code> —
          institution-wide readiness across batches, week-over-week trend,
          subject-level heatmap, AI-forecast for who will hit target on
          time. Session reports (16) export to PDF for parent meetings.
        </>
      }
      capabilities={[
        {
          icon: "📈",
          title: "Trend",
          body: "4-week readiness · per-batch · per-subject",
        },
        {
          icon: "🔥",
          title: "Heatmap",
          body: "topic × difficulty band · weakest cells light up",
        },
        {
          icon: "🔮",
          title: "AI forecast",
          body: "exam-day score band · who's on track / off",
        },
        {
          icon: "📄",
          title: "Reports",
          body: "weekly + monthly · PDF export · parent-ready",
        },
      ]}
      serviceNote="Needs the analytics service to expose a /admin/cohort endpoint that aggregates per-user readiness/mastery into batch-level rollups. Predictive forecast is a Phase-3 model (per docs/02_planning/21_Phase3_SprintDevelopmentPlan.md)."
      primaryCta={{ label: "Authoring meanwhile", to: "/questions" }}
    />
  );
}
