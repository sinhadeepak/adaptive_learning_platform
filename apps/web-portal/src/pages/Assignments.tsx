import { PhaseTwoStub } from "../components/PhaseTwoStub";

export function Assignments() {
  return (
    <PhaseTwoStub
      topbarTitle="Assignments & Mocks"
      pillLabel="◈ ASSIGNMENTS · MOCKS"
      heroTitle="Assign topics · schedule mocks · grade results"
      heroSubtitle={
        <>
          Per <code>docs/ui/04_TeacherPortal/06_assignments.html</code> +{" "}
          <code>08_mock-tests.html</code> — assign focused topic rounds to a
          batch with deadlines, schedule full-syllabus mocks, see completion
          + accuracy per student. AI suggests the right batch + difficulty
          for each assignment based on cohort readiness.
        </>
      }
      capabilities={[
        {
          icon: "📝",
          title: "Active assignments",
          body: "completion bars · due dates · per-student AI risk",
        },
        {
          icon: "🏆",
          title: "Mock tests",
          body: "schedule · 180-question full · sectional · timed",
        },
        {
          icon: "📊",
          title: "Per-student breakdown",
          body: "topic accuracy · question-level replay",
        },
        {
          icon: "🎯",
          title: "AI suggestions",
          body: "right-difficulty band per cohort · timing windows",
        },
      ]}
      serviceNote="Needs an assignments microservice (not yet created). Schema: assignments keyed by (institution_id, batch_id, topic_id) with deadline + scope. Mock tests run on the same Quiz Service infra, just with mode=MOCK and a fixed item set."
      primaryCta={{ label: "Authoring meanwhile", to: "/questions" }}
    />
  );
}
