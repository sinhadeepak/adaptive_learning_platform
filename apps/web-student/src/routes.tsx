import { Navigate, type RouteObject } from "react-router-dom";
import { GuestOnlyRoute, ProtectedRoute } from "./lib/protected-route";
import { AddExam } from "./pages/AddExam";
import { Analysis } from "./pages/Analysis";
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
import { Inbox } from "./pages/Inbox";
import { StudyMap } from "./pages/StudyMap";
import { Login } from "./pages/Login";
import { Placeholder } from "./pages/Placeholder";
import { MockResult } from "./pages/MockResult";
import { MockTest } from "./pages/MockTest";
import { Practice } from "./pages/Practice";
import { Profile } from "./pages/Profile";
import { Quiz } from "./pages/Quiz";
import { QuizResult } from "./pages/QuizResult";
import { Rank } from "./pages/Rank";
import { Register } from "./pages/Register";
import { ResetPassword } from "./pages/ResetPassword";
import { ScreeningExamSelect } from "./pages/screening/ScreeningExamSelect";
import { Search } from "./pages/Search";
import { Settings } from "./pages/Settings";
import { TopicDetail } from "./pages/TopicDetail";
import { Verify } from "./pages/Verify";
import { DailyGoal } from "./pages/onboarding/DailyGoal";
import { ExamSelect } from "./pages/onboarding/ExamSelect";
import { Language } from "./pages/onboarding/Language";
import { TargetDate } from "./pages/onboarding/TargetDate";

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
    path: "/mock",
    element: (
      <ProtectedRoute>
        <MockTest />
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

  // 404
  { path: "*", element: <Placeholder title="Not found" /> },
];
