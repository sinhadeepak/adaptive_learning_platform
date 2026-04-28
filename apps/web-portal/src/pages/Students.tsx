import { PhaseTwoStub } from "../components/PhaseTwoStub";

export function Students() {
  return (
    <PhaseTwoStub
      topbarTitle="Students"
      pillLabel="◈ STUDENT ROSTER"
      heroTitle="Roster · readiness · at-risk · interventions"
      heroSubtitle={
        <>
          Per <code>docs/ui/04_TeacherPortal/02_students-all.html</code> +{" "}
          <code>04_students-at-risk.html</code> — see your students sorted by
          readiness with the AI risk band, drill into any student's full IRT
          profile (θ, mastery matrix, session history), and queue
          interventions per the AI's recommendation.
        </>
      }
      capabilities={[
        {
          icon: "🎓",
          title: "Roster",
          body: "search · filter chips · sortable readiness column",
        },
        {
          icon: "⚠",
          title: "At-risk",
          body: "AI flags students decaying or stalling",
        },
        {
          icon: "🧠",
          title: "Student detail",
          body: "θ · mastery matrix · 90-day session timeline",
        },
        {
          icon: "🎯",
          title: "Interventions",
          body: "assign focus topics · message · escalate",
        },
      ]}
      serviceNote="Backed by the user-profile + analytics services. Roster query: GET /api/v1/admin/students?institution=<id>; per-student readiness pulled from analytics/readiness/<userId>."
      primaryCta={{ label: "Authoring meanwhile", to: "/questions" }}
    />
  );
}
