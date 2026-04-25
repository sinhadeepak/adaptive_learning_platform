import { Navigate, type RouteObject } from "react-router-dom";
import { GuestOnlyRoute, ProtectedRoute } from "./lib/protected-route";
import { Catalog } from "./pages/Catalog";
import { CatalogExam } from "./pages/CatalogExam";
import { ForgotPassword } from "./pages/ForgotPassword";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Placeholder } from "./pages/Placeholder";
import { Quiz } from "./pages/Quiz";
import { QuizResult } from "./pages/QuizResult";
import { Register } from "./pages/Register";
import { ResetPassword } from "./pages/ResetPassword";
import { Search } from "./pages/Search";
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
