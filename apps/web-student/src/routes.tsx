import { Navigate, type RouteObject } from "react-router-dom";
import { GuestOnlyRoute, ProtectedRoute } from "./lib/protected-route";
import { AddExam } from "./pages/AddExam";
import { Analysis } from "./pages/Analysis";
// Phase 5 (P5-S56) — multi-parameter profile + diagnostic deep dive.
import { ConceptProfile } from "./pages/ConceptProfile";
import { DiagnosticDeepDive } from "./pages/DiagnosticDeepDive";
import { Insights } from "./pages/Insights";
import { StudyPlanPage } from "./pages/StudyPlan";
import { RevisionRitual } from "./pages/RevisionRitual";
import { BandwidthSettings } from "./pages/BandwidthSettings";
import { AssignmentDetail } from "./pages/AssignmentDetail";
import { Assignments } from "./pages/Assignments";
import { Billing } from "./pages/Billing";
import { Bookmarks } from "./pages/Bookmarks";
import { JoinCohort } from "./pages/JoinCohort";
import { DoubtDetail } from "./pages/DoubtDetail";
import { Doubts } from "./pages/Doubts";
import { Catalog } from "./pages/Catalog";
import { CatalogExam } from "./pages/CatalogExam";
import { ExamDetail } from "./pages/ExamDetail";
import { Experts } from "./pages/Experts";
import { ForgotPassword } from "./pages/ForgotPassword";
import { History } from "./pages/History";
import { Home } from "./pages/Home";
import { MultiTrack } from "./pages/MultiTrack";
import { Inbox } from "./pages/Inbox";
import { StudyMap } from "./pages/StudyMap";
import { Login } from "./pages/Login";
import { Placeholder } from "./pages/Placeholder";
import { MockResult } from "./pages/MockResult";
import { MockTest } from "./pages/MockTest";
import { MockExam } from "./pages/MockExam";
import { Mocks } from "./pages/Mocks";
import { PYQDrill } from "./pages/PYQDrill";
import { Revision } from "./pages/Revision";
import { SyllabusCoverage } from "./pages/SyllabusCoverage";
import { Practice } from "./pages/Practice";
import { StudyPortfolio } from "./pages/StudyPortfolio";
import { MistakesPractice } from "./pages/MistakesPractice";
import { DiagnosticPlacement } from "./pages/DiagnosticPlacement";
import { TestBuilder } from "./pages/TestBuilder";
import { MyTests } from "./pages/MyTests";
import { SharedTestLanding } from "./pages/SharedTestLanding";
import { AISuggestedTests } from "./pages/AISuggestedTests";
import { Library } from "./pages/Library";
import { Battle } from "./pages/Battle";
import { Friends } from "./pages/Friends";
import { Clans } from "./pages/Clans";
import { ClanDetailPage } from "./pages/ClanDetail";
import { Leaderboards } from "./pages/Leaderboards";
import { Profile } from "./pages/Profile";
import { Quiz } from "./pages/Quiz";
import { QuizResult } from "./pages/QuizResult";
import { SessionDeepDive } from "./pages/SessionDeepDive";
import { TutorChatHistory, TutorChatTranscript } from "./pages/TutorChatHistory";
import { Flashcards } from "./pages/Flashcards";
import { League } from "./pages/League";
import { Rank } from "./pages/Rank";
import { Register } from "./pages/Register";
import { ResetPassword } from "./pages/ResetPassword";
import { ScreeningExamSelect } from "./pages/screening/ScreeningExamSelect";
import { Search } from "./pages/Search";
import { Settings } from "./pages/Settings";
import { TopicDetail } from "./pages/TopicDetail";
import { Verify } from "./pages/Verify";
import { DailyGoal } from "./pages/onboarding/DailyGoal";
import { Diagnostic as OnboardingDiagnostic } from "./pages/onboarding/Diagnostic";
import { ExamSelect } from "./pages/onboarding/ExamSelect";
import { Language } from "./pages/onboarding/Language";
import { TargetDate } from "./pages/onboarding/TargetDate";
import { Tutors } from "./pages/Tutors";
import { TutorDetail } from "./pages/TutorDetail";
import { MyBookings } from "./pages/MyBookings";
import { Courses } from "./pages/Courses";
import { CourseDetail } from "./pages/CourseDetail";
import { MyPurchases } from "./pages/MyPurchases";
import { CourseRead } from "./pages/CourseRead";

// Sprint 1 route map — see docs/01_design/08_Wireframes_Sprint1_Student_AdaptiveLearningPlatform.md.
// Login is the only page fully implemented in Sprint 0; the rest are placeholders
// that FE Lead A fills in during Sprint 1.

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/login" replace /> },

  // Guest-only (redirect to /home if already logged in)
  {
    path: "/login",
    element: (
      <GuestOnlyRoute>
        <Login />
      </GuestOnlyRoute>
    ),
  },
  {
    path: "/register",
    element: (
      <GuestOnlyRoute>
        <Register />
      </GuestOnlyRoute>
    ),
  },
  {
    path: "/verify",
    element: (
      <GuestOnlyRoute>
        <Verify />
      </GuestOnlyRoute>
    ),
  },
  {
    path: "/forgot-password",
    element: (
      <GuestOnlyRoute>
        <ForgotPassword />
      </GuestOnlyRoute>
    ),
  },
  {
    path: "/reset-password",
    element: (
      <GuestOnlyRoute>
        <ResetPassword />
      </GuestOnlyRoute>
    ),
  },

  // AI Screening Test — guest-accessible (no auth required). Lets a
  // prospective student pick an exam and run a 10-question diagnostic
  // before deciding to sign up.
  { path: "/screening", element: <ScreeningExamSelect /> },
  {
    path: "/screening/quiz",
    element: <Placeholder title="Screening test · coming soon" />,
  },

  // Onboarding (protected, gated by onboarding_state FSM)
  {
    path: "/onboarding/exam",
    element: (
      <ProtectedRoute>
        <ExamSelect />
      </ProtectedRoute>
    ),
  },
  {
    path: "/onboarding/language",
    element: (
      <ProtectedRoute>
        <Language />
      </ProtectedRoute>
    ),
  },
  {
    path: "/onboarding/target-date",
    element: (
      <ProtectedRoute>
        <TargetDate />
      </ProtectedRoute>
    ),
  },
  {
    path: "/onboarding/diagnostic",
    element: (
      <ProtectedRoute>
        <OnboardingDiagnostic />
      </ProtectedRoute>
    ),
  },
  {
    path: "/onboarding/daily-goal",
    element: (
      <ProtectedRoute>
        <DailyGoal />
      </ProtectedRoute>
    ),
  },

  // Authenticated surfaces
  {
    path: "/home",
    element: (
      <ProtectedRoute>
        <Home />
      </ProtectedRoute>
    ),
  },
  {
    path: "/tracks",
    element: (
      <ProtectedRoute>
        <MultiTrack />
      </ProtectedRoute>
    ),
  },
  {
    // Static path must come BEFORE the dynamic :examId route so
    // "add" doesn't get captured as an exam ID.
    path: "/exams/add",
    element: (
      <ProtectedRoute>
        <AddExam />
      </ProtectedRoute>
    ),
  },
  {
    path: "/exams/:examId",
    element: (
      <ProtectedRoute>
        <ExamDetail />
      </ProtectedRoute>
    ),
  },
  {
    path: "/study/:examId",
    element: (
      <ProtectedRoute>
        <StudyMap />
      </ProtectedRoute>
    ),
  },
  {
    path: "/study/:examId/:subjectId",
    element: (
      <ProtectedRoute>
        <StudyMap />
      </ProtectedRoute>
    ),
  },
  {
    path: "/catalog",
    element: (
      <ProtectedRoute>
        <Catalog />
      </ProtectedRoute>
    ),
  },
  {
    path: "/catalog/exam/:examId",
    element: (
      <ProtectedRoute>
        <CatalogExam />
      </ProtectedRoute>
    ),
  },
  {
    path: "/catalog/topic/:topicId",
    element: (
      <ProtectedRoute>
        <TopicDetail />
      </ProtectedRoute>
    ),
  },
  {
    path: "/search",
    element: (
      <ProtectedRoute>
        <Search />
      </ProtectedRoute>
    ),
  },
  {
    path: "/analysis",
    element: (
      <ProtectedRoute>
        <Analysis />
      </ProtectedRoute>
    ),
  },
  {
    path: "/experts",
    element: (
      <ProtectedRoute>
        <Experts />
      </ProtectedRoute>
    ),
  },
  {
    path: "/rank",
    element: (
      <ProtectedRoute>
        <Rank />
      </ProtectedRoute>
    ),
  },
  {
    path: "/practice",
    element: (
      <ProtectedRoute>
        <Practice />
      </ProtectedRoute>
    ),
  },
  {
    path: "/practice/mistakes",
    element: (
      <ProtectedRoute>
        <MistakesPractice />
      </ProtectedRoute>
    ),
  },
  {
    path: "/practice/diagnostic",
    element: (
      <ProtectedRoute>
        <DiagnosticPlacement />
      </ProtectedRoute>
    ),
  },
  {
    path: "/practice/build",
    element: (
      <ProtectedRoute>
        <TestBuilder />
      </ProtectedRoute>
    ),
  },
  {
    // Phase B2 — Study Portfolio (current-vs-optimal allocation).
    path: "/portfolio",
    element: (
      <ProtectedRoute>
        <StudyPortfolio />
      </ProtectedRoute>
    ),
  },
  {
    path: "/practice/my-tests",
    element: (
      <ProtectedRoute>
        <MyTests />
      </ProtectedRoute>
    ),
  },
  {
    path: "/practice/ai-suggestions",
    element: (
      <ProtectedRoute>
        <AISuggestedTests />
      </ProtectedRoute>
    ),
  },
  {
    path: "/library",
    element: (
      <ProtectedRoute>
        <Library />
      </ProtectedRoute>
    ),
  },
  {
    path: "/battle",
    element: (
      <ProtectedRoute>
        <Battle />
      </ProtectedRoute>
    ),
  },
  {
    path: "/friends",
    element: (
      <ProtectedRoute>
        <Friends />
      </ProtectedRoute>
    ),
  },
  {
    path: "/clans",
    element: (
      <ProtectedRoute>
        <Clans />
      </ProtectedRoute>
    ),
  },
  {
    path: "/clans/:clanId",
    element: (
      <ProtectedRoute>
        <ClanDetailPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/leaderboards",
    element: (
      <ProtectedRoute>
        <Leaderboards />
      </ProtectedRoute>
    ),
  },
  {
    path: "/t/:slug",
    element: (
      <ProtectedRoute>
        <SharedTestLanding />
      </ProtectedRoute>
    ),
  },
  {
    path: "/mock",
    element: (
      <ProtectedRoute>
        <MockTest />
      </ProtectedRoute>
    ),
  },
  {
    // Sprint 23 (P4-S23) — blueprint-driven exam-mode player.
    path: "/mock-exam",
    element: (
      <ProtectedRoute>
        <MockExam />
      </ProtectedRoute>
    ),
  },
  {
    // Sprint 24 (P4-S24) — PYQ chapter/year drill view.
    path: "/pyq",
    element: (
      <ProtectedRoute>
        <PYQDrill />
      </ProtectedRoute>
    ),
  },
  {
    // Sprint 25 (P4-S25) — Mocks series view.
    path: "/mocks",
    element: (
      <ProtectedRoute>
        <Mocks />
      </ProtectedRoute>
    ),
  },
  {
    // Sprint 27 (P4-S27) — Daily revision queue.
    path: "/revision",
    element: (
      <ProtectedRoute>
        <Revision />
      </ProtectedRoute>
    ),
  },
  {
    // Sprint 28 (P4-S28) — Syllabus coverage audit.
    path: "/syllabus",
    element: (
      <ProtectedRoute>
        <SyllabusCoverage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/mock/result",
    element: (
      <ProtectedRoute>
        <MockResult />
      </ProtectedRoute>
    ),
  },
  {
    path: "/profile",
    element: (
      <ProtectedRoute>
        <Profile />
      </ProtectedRoute>
    ),
  },
  {
    path: "/bookmarks",
    element: (
      <ProtectedRoute>
        <Bookmarks />
      </ProtectedRoute>
    ),
  },
  {
    path: "/history",
    element: (
      <ProtectedRoute>
        <History />
      </ProtectedRoute>
    ),
  },
  {
    path: "/inbox",
    element: (
      <ProtectedRoute>
        <Inbox />
      </ProtectedRoute>
    ),
  },
  {
    path: "/doubts",
    element: (
      <ProtectedRoute>
        <Doubts />
      </ProtectedRoute>
    ),
  },
  {
    path: "/doubts/:doubtId",
    element: (
      <ProtectedRoute>
        <DoubtDetail />
      </ProtectedRoute>
    ),
  },
  {
    path: "/settings",
    element: (
      <ProtectedRoute>
        <Settings />
      </ProtectedRoute>
    ),
  },
  // Sprint 8 F-1 — billing page (subscription summary, post-Checkout lander).
  {
    path: "/billing",
    element: (
      <ProtectedRoute>
        <Billing />
      </ProtectedRoute>
    ),
  },
  // Sprint 9 F-1 — Educator Assignments inbox + detail.
  {
    path: "/assignments",
    element: (
      <ProtectedRoute>
        <Assignments />
      </ProtectedRoute>
    ),
  },
  {
    path: "/assignments/:assignmentId",
    element: (
      <ProtectedRoute>
        <AssignmentDetail />
      </ProtectedRoute>
    ),
  },
  // Sprint 11 S11-A — cohort invite landing.
  {
    path: "/join/:token",
    element: (
      <ProtectedRoute>
        <JoinCohort />
      </ProtectedRoute>
    ),
  },

  // Quiz play (Sprint 3)
  {
    path: "/quiz/:sessionId",
    element: (
      <ProtectedRoute>
        <Quiz />
      </ProtectedRoute>
    ),
  },
  {
    path: "/quiz/:sessionId/result",
    element: (
      <ProtectedRoute>
        <QuizResult />
      </ProtectedRoute>
    ),
  },
  // Phase 1D-1 — post-test session deep-dive.
  {
    path: "/sessions/:sessionId/deep-dive",
    element: (
      <ProtectedRoute>
        <SessionDeepDive />
      </ProtectedRoute>
    ),
  },
  // Phase 1D-3 — tutor chat history.
  {
    path: "/tutor-history",
    element: (
      <ProtectedRoute>
        <TutorChatHistory />
      </ProtectedRoute>
    ),
  },
  {
    path: "/tutor-history/:sessionId",
    element: (
      <ProtectedRoute>
        <TutorChatTranscript />
      </ProtectedRoute>
    ),
  },
  // Phase 1D-8 — flashcards.
  {
    path: "/flashcards",
    element: (
      <ProtectedRoute>
        <Flashcards />
      </ProtectedRoute>
    ),
  },
  // Phase 1D-9 — league standings.
  {
    path: "/league",
    element: (
      <ProtectedRoute>
        <League />
      </ProtectedRoute>
    ),
  },

  // Sprint 17 (P3-S2) — Marketplace tutor browsing + booking.
  {
    path: "/tutors",
    element: (
      <ProtectedRoute>
        <Tutors />
      </ProtectedRoute>
    ),
  },
  {
    path: "/tutors/:userId",
    element: (
      <ProtectedRoute>
        <TutorDetail />
      </ProtectedRoute>
    ),
  },
  {
    path: "/bookings",
    element: (
      <ProtectedRoute>
        <MyBookings />
      </ProtectedRoute>
    ),
  },
  // Sprint 18 (P3-S3) — Course marketplace.
  {
    path: "/courses",
    element: (
      <ProtectedRoute>
        <Courses />
      </ProtectedRoute>
    ),
  },
  {
    path: "/courses/:courseId",
    element: (
      <ProtectedRoute>
        <CourseDetail />
      </ProtectedRoute>
    ),
  },
  {
    path: "/courses-mine",
    element: (
      <ProtectedRoute>
        <MyPurchases />
      </ProtectedRoute>
    ),
  },
  {
    path: "/courses/:courseId/read",
    element: (
      <ProtectedRoute>
        <CourseRead />
      </ProtectedRoute>
    ),
  },

  // Phase 6 S57 — Low-bandwidth preferences (UX-32).
  {
    path: "/settings/bandwidth",
    element: (
      <ProtectedRoute>
        <BandwidthSettings />
      </ProtectedRoute>
    ),
  },

  // Phase 6 S56 — Revision ritual (5-question recall flow).
  {
    path: "/revision/ritual/:conceptId?",
    element: (
      <ProtectedRoute>
        <RevisionRitual />
      </ProtectedRoute>
    ),
  },

  // Phase 6 S55 — Constrained plan editor.
  {
    path: "/plan",
    element: (
      <ProtectedRoute>
        <StudyPlanPage />
      </ProtectedRoute>
    ),
  },

  // Phase 6 S52 — Insights hub re-IA over the Phase-5 analytics surfaces.
  // The legacy deep links (/concept-profile, /diagnostic-deep-dive,
  // /syllabus, /revision) all remain reachable as the "Why am I seeing
  // this?" targets per ADR-0020.
  {
    path: "/insights",
    element: (
      <ProtectedRoute>
        <Insights />
      </ProtectedRoute>
    ),
  },

  // Phase 5 (P5-S56) — multi-parameter substrate surface.
  {
    path: "/concept-profile",
    element: (
      <ProtectedRoute>
        <ConceptProfile />
      </ProtectedRoute>
    ),
  },
  {
    path: "/diagnostic-deep-dive",
    element: (
      <ProtectedRoute>
        <DiagnosticDeepDive />
      </ProtectedRoute>
    ),
  },

  // 404
  { path: "*", element: <Placeholder title="Not found" /> },
];
