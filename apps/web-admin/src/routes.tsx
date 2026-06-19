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
import { AnalyticsDrill } from "./pages/AnalyticsDrill";
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
import { TranslationsList } from "./pages/TranslationsList";
import { CulturalReview } from "./pages/CulturalReview";
import { GraderQueue } from "./pages/GraderQueue";
// Track 2 follow-ups — Sprint A5 (institute) + A6/A7 (platform).
import { InstituteAnalytics } from "./pages/InstituteAnalytics";
import { PlatformAnalytics } from "./pages/PlatformAnalytics";
// P7 — Admin AI-assisted exam builder.
import { ExamBuilder } from "./pages/ExamBuilder";
import { ExamsList } from "./pages/ExamsList";
import { AIProviders } from "./pages/AIProviders";
import { TranslationBatch } from "./pages/TranslationBatch";
import { TranslationBatches } from "./pages/TranslationBatches";
import { TranslationVerify } from "./pages/TranslationVerify";
import { Languages } from "./pages/Languages";

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
  // Phase 7 (P7-A1) — six-level hierarchical analytics drill.
  adminRoute("/analytics/drill", <AnalyticsDrill />),
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
  // /translation-review now defaults to the paginated question list;
  // clicking a row's "Translations" action drills into
  // /translation-review/:questionId where source ↔ translation diff
  // and approve/reject lives.
  adminRoute("/translation-review", <TranslationsList />),
  adminRoute("/translation-review/:questionId", <TranslationReview />),
  adminRoute("/cultural-review", <CulturalReview />),
  adminRoute("/grader-queue", <GraderQueue />),
  // Track 2 — institute admin (A5) + platform analytics (A6/A7).
  adminRoute("/institutes/:tenantId/analytics", <InstituteAnalytics />),
  adminRoute("/platform-analytics", <PlatformAnalytics />),
  // P7 — AI-assisted exam authoring (create + edit).
  adminRoute("/exams", <ExamsList />),
  adminRoute("/exams/new", <ExamBuilder />),
  adminRoute("/exams/edit/:examId", <ExamBuilder />),
  // P7 — Multi-provider AI chain (Ollama → OpenAI → Anthropic) config.
  adminRoute("/ai-providers", <AIProviders />),
  // Bulk Translation Workbench — batch list + progress pages.
  adminRoute("/translation-batches", <TranslationBatches />),
  adminRoute("/translation-batches/:batchId", <TranslationBatch />),
  // Bulk verification screen (Task 11).
  adminRoute("/translation-verify", <TranslationVerify />),
  // Language registry (Task 12).
  adminRoute("/languages", <Languages />),
  { path: "*", element: <Navigate to="/dashboard" replace /> },
];
