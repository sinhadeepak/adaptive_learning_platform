import { Navigate, type RouteObject } from "react-router-dom";
import { GuestOnlyRoute, ProtectedRoute, RoleGate } from "./lib/protected-route";
import { canAuthor, canReview } from "./lib/auth-provider";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { MyQuestions } from "./pages/MyQuestions";
import { NewQuestion } from "./pages/NewQuestion";
import { ReviewQueue } from "./pages/ReviewQueue";

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
  {
    path: "/dashboard",
    element: (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: "/questions",
    element: (
      <ProtectedRoute>
        <MyQuestions />
      </ProtectedRoute>
    ),
  },
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
  { path: "*", element: <Navigate to="/dashboard" replace /> },
];
