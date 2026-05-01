/**
 * Phase 5 admin pages — Vitest component tests (P5-S65).
 *
 * Covers the 6 pages from S54: CostDashboard, CalibrationDashboard,
 * TranslationAnalytics, TranslationReview, CulturalReview, GraderQueue.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "./lib/auth-provider";
import { auth } from "./lib/api";
import { CostDashboard } from "./pages/CostDashboard";
import { CalibrationDashboard } from "./pages/CalibrationDashboard";
import { TranslationAnalytics } from "./pages/TranslationAnalytics";
import { TranslationReview } from "./pages/TranslationReview";
import { CulturalReview } from "./pages/CulturalReview";
import { GraderQueue } from "./pages/GraderQueue";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <AuthProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  Object.assign(auth, {
    getUser: () => ({
      id: "u-1",
      email: "ops@alp.dev",
      firstName: "Ops",
      role: "PLATFORM_ADMIN",
    }),
    isAuthenticated: () => true,
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response("not found", { status: 404 }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(auth, {
    getUser: () => null,
    isAuthenticated: () => false,
  });
});

// ── CostDashboard ────────────────────────────────────────────────────────

test("CostDashboard renders 3 rolling-window cards from /admin/ai-cost", async () => {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/profile/me")) {
        return new Response(
          JSON.stringify({
            user: { firstName: "Ops", role: "PLATFORM_ADMIN" },
            preferences: {},
            exams: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/admin/ai-cost")) {
        return new Response(
          JSON.stringify({
            day: {
              period: "day",
              totalUsd: 1.23,
              callCount: 50,
              byTouchpoint: { authoring: 0.8, evaluation: 0.43 },
              byProvider: { openai: 1.23 },
              topCreators: [{ creatorId: "alice", costUsd: 0.55 }],
            },
            week: {
              period: "week",
              totalUsd: 7.89,
              callCount: 320,
              byTouchpoint: {},
              byProvider: {},
              topCreators: [],
            },
            month: {
              period: "month",
              totalUsd: 24.5,
              callCount: 1100,
              byTouchpoint: {},
              byProvider: {},
              topCreators: [{ creatorId: "alice", costUsd: 12.5 }],
            },
            alerts: [
              {
                period: "month",
                thresholdPct: 80,
                currentUsd: 800,
                budgetUsd: 1000,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    },
  );
  renderWithProviders(<CostDashboard />);
  expect(await screen.findByText("$1.23")).toBeInTheDocument();
  expect(screen.getByText("$7.89")).toBeInTheDocument();
  expect(screen.getByText("$24.50")).toBeInTheDocument();
  // Alert banner
  expect(
    await screen.findByText(/80% threshold breached/i),
  ).toBeInTheDocument();
  // Top creators table renders
  expect(screen.getByText("alice")).toBeInTheDocument();
});

// ── CalibrationDashboard ────────────────────────────────────────────────

test("CalibrationDashboard surfaces auto-paused criteria with red banner", async () => {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/profile/me")) {
        return new Response(
          JSON.stringify({
            user: { firstName: "Ops", role: "PLATFORM_ADMIN" },
            preferences: {},
            exams: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/evaluation/calibration/dashboard")) {
        return new Response(
          JSON.stringify({
            asOf: new Date().toISOString(),
            floorKappa: 0.7,
            autoPausedCriteria: ["c1"],
            criteria: [
              {
                criterion: "c1",
                kappa: 0.5,
                sample_count: 50,
                auto_paused: true,
                weekly_trend: [],
              },
              {
                criterion: "c2",
                kappa: 0.85,
                sample_count: 100,
                auto_paused: false,
                weekly_trend: [],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    },
  );
  renderWithProviders(<CalibrationDashboard />);
  // Floor kappa surfaces.
  expect(await screen.findByText(/^0\.70$/)).toBeInTheDocument();
  // Both criteria render.
  expect(screen.getByText("c1")).toBeInTheDocument();
  expect(screen.getByText("c2")).toBeInTheDocument();
  // Auto-paused banner.
  expect(
    screen.getByText(/criterion\(s\) below.*AI evaluation auto-paused/i),
  ).toBeInTheDocument();
});

// ── TranslationAnalytics ────────────────────────────────────────────────

test("TranslationAnalytics renders per-language quality table + targets", async () => {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/profile/me")) {
        return new Response(
          JSON.stringify({
            user: { firstName: "Ops", role: "PLATFORM_ADMIN" },
            preferences: {},
            exams: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/localisation/analytics")) {
        return new Response(
          JSON.stringify({
            weeks: 12,
            targets: {
              acceptanceRateTarget: 0.7,
              retranslationRateCeiling: 0.1,
              leadTimeP95HoursTarget: 36,
            },
            perLanguage: [
              {
                language: "hi",
                translationsTotal: 50,
                translationsPublished: 35,
                translationsDraft: 10,
                translationsInReview: 5,
                avgAiConfidence: 0.86,
                acceptanceRate: 0.75,
                retranslationRate: 0.05,
                culturalFlagRate: null,
                leadTimeP50Hours: 12,
                leadTimeP95Hours: 28,
              },
            ],
            glossarySize: [
              {
                subject: "biology",
                sourceLang: "en",
                targetLang: "hi",
                entryCount: 42,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    },
  );
  renderWithProviders(<TranslationAnalytics />);
  expect(await screen.findByText("HI")).toBeInTheDocument();
  expect(screen.getByText(/acceptance rate/i)).toBeInTheDocument();
  // Glossary size
  expect(screen.getByText(/Glossary growth/i)).toBeInTheDocument();
  expect(screen.getByText("biology")).toBeInTheDocument();
});

// ── GraderQueue ──────────────────────────────────────────────────────────

test("GraderQueue starts at calibration warm-up", async () => {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/v1/profile/me")) {
        return new Response(
          JSON.stringify({
            user: { firstName: "Grader", role: "MODERATOR" },
            preferences: {},
            exams: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    },
  );
  renderWithProviders(<GraderQueue />);
  expect(
    await screen.findByText(/Daily calibration warm-up/i),
  ).toBeInTheDocument();
  // First item references Rayleigh scattering (cal-1 stem).
  expect(
    screen.getByText(/Rayleigh scattering/i),
  ).toBeInTheDocument();
});

// ── TranslationReview ───────────────────────────────────────────────────

test("TranslationReview renders the artifact UUID input", async () => {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/v1/profile/me")) {
        return new Response(
          JSON.stringify({
            user: { firstName: "Ops", role: "PLATFORM_ADMIN" },
            preferences: {},
            exams: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    },
  );
  renderWithProviders(<TranslationReview />);
  expect(
    await screen.findByPlaceholderText(/00000000-0000-0000-0000/i),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Load translations/i }),
  ).toBeInTheDocument();
});

// ── CulturalReview ──────────────────────────────────────────────────────

test("CulturalReview surfaces 5-day SLA + rationale", async () => {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/v1/profile/me")) {
        return new Response(
          JSON.stringify({
            user: { firstName: "Cultural", role: "PLATFORM_ADMIN" },
            preferences: {},
            exams: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    },
  );
  renderWithProviders(<CulturalReview />);
  expect(await screen.findByText(/5-day SLA/i)).toBeInTheDocument();
  expect(screen.getByText(/About cultural review/i)).toBeInTheDocument();
});
