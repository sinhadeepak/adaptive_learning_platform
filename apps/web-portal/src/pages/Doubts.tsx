import { PhaseTwoStub } from "../components/PhaseTwoStub";

export function Doubts() {
  return (
    <PhaseTwoStub
      topbarTitle="Doubts"
      pillLabel="◈ STUDENT DOUBTS · INBOX"
      heroTitle="Answer doubts · approve AI drafts · escalate"
      heroSubtitle={
        <>
          Per <code>docs/ui/04_TeacherPortal/10_doubts.html</code> — students
          can post a doubt from any quiz item. The AI generates a draft
          answer; you review, edit, send. Threading + history per student so
          you can see prior context. Escalation to subject experts is one
          click.
        </>
      }
      capabilities={[
        {
          icon: "📥",
          title: "Inbox",
          body: "all open doubts · filter by subject / severity",
        },
        {
          icon: "🤖",
          title: "AI drafts",
          body: "Anthropic-generated answers · you approve",
        },
        {
          icon: "💬",
          title: "Threads",
          body: "follow-up Qs · attach diagrams · markdown",
        },
        {
          icon: "🪜",
          title: "Escalate",
          body: "to subject experts · notify on resolution",
        },
      ]}
      serviceNote="Needs a doubts microservice (not yet created). Schema: doubt threads keyed by (student_id, question_id), with messages + AI draft state. Anthropic Claude is the LLM behind the drafts (already in tech-stack ADRs but not wired yet)."
      primaryCta={{ label: "Authoring meanwhile", to: "/questions" }}
    />
  );
}
