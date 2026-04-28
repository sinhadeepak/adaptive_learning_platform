import type { ReactElement } from "react";
import { Navigate, type RouteObject } from "react-router-dom";
import { AdminGate, GuestOnlyRoute, ProtectedRoute } from "./lib/protected-route";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { FlagDetail } from "./pages/FlagDetail";
import { Flags } from "./pages/Flags";
import { Audit } from "./pages/Audit";
import { EducatorScope } from "./pages/EducatorScope";
import { Users } from "./pages/Users";
import { Tenants } from "./pages/Tenants";
import { TenantCohorts } from "./pages/TenantCohorts";
import { Ops } from "./pages/Ops";
import { Profile } from "./pages/Profile";
import { Settings } from "./pages/Settings";
import { TutorAdminActions } from "./pages/TutorAdminActions";
import { TutorModerationQueue } from "./pages/TutorModerationQueue";

const adminRoute = (path: string, element: ReactElement): RouteObject => ({
  path,
  element: (
    <ProtectedRoute>
      <AdminGate>{element}</AdminGate>
    </ProtectedRoute>
  ),
});

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/dashboard" replace /> },
  adminRoute("/dashboard", <Dashboard />),
  {
    path: "/login",
    element: (
      <GuestOnlyRoute>
        <Login />
      </GuestOnlyRoute>
    ),
  },
  adminRoute("/flags", <Flags />),
  adminRoute("/flags/:name", <FlagDetail />),
  adminRoute("/audit", <Audit />),
  adminRoute("/users", <Users />),
  adminRoute("/educator-scope", <EducatorScope />),
  adminRoute("/tenants", <Tenants />),
  // Sprint 10 S10-C — Institution Core management.
  adminRoute("/institutions", <Tenants />),
  adminRoute("/institutions/:tenantId/cohorts", <TenantCohorts />),
  adminRoute("/ops", <Ops />),
  adminRoute("/profile", <Profile />),
  adminRoute("/settings", <Settings />),
  // Sprint 17 (P3-S2) — Tutor moderation.
  adminRoute("/tutors-admin", <TutorModerationQueue />),
  adminRoute("/tutors-admin/:userId", <TutorAdminActions />),
  { path: "*", element: <Navigate to="/dashboard" replace /> },
];
