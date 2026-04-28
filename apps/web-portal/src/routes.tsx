import type { ReactElement } from "react";
import { Navigate, type RouteObject } from "react-router-dom";
import { GuestOnlyRoute, ProtectedRoute, RoleGate } from "./lib/protected-route";
import { canAuthor, canReview } from "./lib/auth-provider";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { MyQuestions } from "./pages/MyQuestions";
import { NewQuestion } from "./pages/NewQuestion";
import { ReviewQueue } from "./pages/ReviewQueue";
import { Students } from "./pages/Students";
import { Doubts } from "./pages/Doubts";
import { Assignments } from "./pages/Assignments";
import { AssignmentDetail } from "./pages/AssignmentDetail";
import { AssignmentNew } from "./pages/AssignmentNew";
import { Analytics } from "./pages/Analytics";
import { CohortLeaderboard } from "./pages/CohortLeaderboard";
import { StudentDrillDown } from "./pages/StudentDrillDown";
import { TutorApply } from "./pages/TutorApply";
import { TutorDashboard } from "./pages/TutorDashboard";
import { CreatorApply } from "./pages/CreatorApply";
import { CreatorDashboard } from "./pages/CreatorDashboard";
import { MyCourses } from "./pages/MyCourses";
import { CourseAuthor } from "./pages/CourseAuthor";

const protectedRoute = (path: string, element: ReactElement): RouteObject => ({
  path,
  element: <ProtectedRoute>{element}</ProtectedRoute>,
});

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/dashboard" replace /> },
  {
    path: "/login",
    element: (
      <GuestOnlyRoute>
        <Login />
      </GuestOnlyRoute>
    ),
  },
  protectedRoute("/dashboard", <Dashboard />),
  protectedRoute("/questions", <MyQuestions />),
  {
    path: "/questions/new",
    element: (
      <ProtectedRoute>
        <RoleGate allow={canAuthor}>
          <NewQuestion />
        </RoleGate>
      </ProtectedRoute>
    ),
  },
  {
    path: "/review",
    element: (
      <ProtectedRoute>
        <RoleGate allow={canReview}>
          <ReviewQueue />
        </RoleGate>
      </ProtectedRoute>
    ),
  },
  protectedRoute("/students", <Students />),
  protectedRoute("/doubts", <Doubts />),
  protectedRoute("/assignments", <Assignments />),
  {
    path: "/assignments/new",
    element: (
      <ProtectedRoute>
        <RoleGate allow={canAuthor}>
          <AssignmentNew />
        </RoleGate>
      </ProtectedRoute>
    ),
  },
  protectedRoute("/assignments/:assignmentId", <AssignmentDetail />),
  // Sprint 10 S10-E — cohort leaderboard.
  protectedRoute("/cohorts/:cohortId/leaderboard", <CohortLeaderboard />),
  // Sprint 13 S13-C — per-student drill-down.
  protectedRoute(
    "/cohorts/:cohortId/students/:userId",
    <StudentDrillDown />,
  ),
  protectedRoute("/analytics", <Analytics />),
  // Sprint 16 (P3-S1) — Tutor marketplace, supply side.
  protectedRoute("/tutor", <TutorDashboard />),
  protectedRoute("/tutor/apply", <TutorApply />),
  // Sprint 18 (P3-S3) — Creator marketplace.
  protectedRoute("/creator", <CreatorDashboard />),
  protectedRoute("/creator/apply", <CreatorApply />),
  protectedRoute("/creator/courses", <MyCourses />),
  protectedRoute("/creator/courses/new", <CourseAuthor />),
  protectedRoute("/creator/courses/:courseId/edit", <CourseAuthor />),
  { path: "*", element: <Navigate to="/dashboard" replace /> },
];
