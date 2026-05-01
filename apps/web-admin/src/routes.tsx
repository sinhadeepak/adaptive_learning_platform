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
import { RatingModeration } from "./pages/RatingModeration";
// Phase 5 (P5-S54) — admin operator surfaces.
import { CostDashboard } from "./pages/CostDashboard";
import { CalibrationDashboard } from "./pages/CalibrationDashboard";
import { TranslationAnalytics } from "./pages/TranslationAnalytics";
import { TranslationReview } from "./pages/TranslationReview";
import { CulturalReview } from "./pages/CulturalReview";
import { GraderQueue } from "./pages/GraderQueue";

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
  // Sprint 20 (P3-S5) — Rating moderation.
  adminRoute("/ratings-mod", <RatingModeration />),
  // Phase 5 (P5-S54) — admin operator surfaces.
  adminRoute("/ai-cost", <CostDashboard />),
  adminRoute("/calibration-dashboard", <CalibrationDashboard />),
  adminRoute("/translation-analytics", <TranslationAnalytics />),
  adminRoute("/translation-review", <TranslationReview />),
  adminRoute("/cultural-review", <CulturalReview />),
  adminRoute("/grader-queue", <GraderQueue />),
  { path: "*", element: <Navigate to="/dashboard" replace /> },
];
