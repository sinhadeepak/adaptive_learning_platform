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
import { Analytics } from "./pages/Analytics";

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
  protectedRoute("/analytics", <Analytics />),
  { path: "*", element: <Navigate to="/dashboard" replace /> },
];
