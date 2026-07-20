// Page smoke tests for the Study Materials hub.
//
// Verifies: subject/topic headings render, the Revise panel shows overdue
// rows, Continue-watching shows a resume %, and each resource_type renders
// the right affordance.

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import { ExamContent } from "./ExamContent";
import type {
  ExamContentTree,
  StudyReadiness,
  WatchSummary,
} from "../lib/api";

const TEST_USER = {
  id: "u-1",
  email: "t@example.com",
  firstName: "T",
  role: "STUDENT" as const,
  onboardingState: "ONBOARDED" as const,
};

vi.mock("../lib/auth-provider", () => ({
  useAuth: () => ({ user: TEST_USER }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../components/vidya/VidyaShell", () => ({
  VidyaShell: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

// Stub the heavy modals so we only test the hub's wiring.
vi.mock("../components/EmbeddedVideoPlayer", () => ({
  EmbeddedVideoPlayer: ({ resource }: { resource: { title: string } }) => (
    <div data-testid="video-player">{resource.title}</div>
  ),
}));
vi.mock("../components/content/DocumentViewer", () => ({
  DocumentViewer: ({ resource }: { resource: { title: string } }) => (
    <div data-testid="doc-viewer">{resource.title}</div>
  ),
}));

const tree: ExamContentTree = {
  exam_id: "e-1",
  subjects: [
    {
      subject_id: "s-1",
      subject_name: "Physics",
      topics: [
        {
          topic_id: "t-1",
          topic_title: "Kinematics",
          counts: { video: 1, document: 1 },
          resources: [
            {
              id: "v-1",
              topic_id: "t-1",
              concept_id: null,
              question_id: null,
              resource_type: "youtube_video",
              external_id: "abc",
              url: "https://youtu.be/abc",
              title: "Motion graphs",
              description: null,
              channel_name: "Phys",
              duration_seconds: 200,
              thumbnail_url: null,
              language: "en",
              difficulty: null,
            },
            {
              id: "d-1",
              topic_id: "t-1",
              concept_id: null,
              question_id: null,
              resource_type: "document",
              external_id: null,
              url: "study-materials/x.pdf",
              title: "Kinematics sheet",
              description: null,
              channel_name: null,
              duration_seconds: null,
              thumbnail_url: null,
              language: "en",
              difficulty: null,
              doc_object_key: "study-materials/x.pdf",
            },
          ],
        },
      ],
    },
  ],
};

const watch: WatchSummary = {
  user_id: "u-1",
  exam_id: "e-1",
  perResource: {
    "v-1": {
      furthestPositionSeconds: 100,
      resumePositionSeconds: 100,
      furthestPercent: 50,
      watched: false,
    },
  },
  perTopic: {
    "t-1": {
      minutesWatched: 12,
      resourcesWatched: 1,
      resourcesCompleted: 0,
      documentsCompleted: 0,
    },
  },
};

const readiness: StudyReadiness = {
  userId: "u-1",
  examId: "e-1",
  now: "2026-06-29T00:00:00Z",
  topics: [
    {
      topicId: "t-1",
      topicTitle: "Kinematics",
      dueAt: "2026-06-20T00:00:00Z",
      overdueDays: 9,
      intervalDays: 6,
      easeFactor: 2.3,
      attempts: 3,
      ewa: 0.3,
      n: 5,
      minutesWatched: 12,
      resourcesCompleted: 0,
      revisionNeed: "HIGH",
    },
  ],
};

vi.mock("../lib/api", () => ({
  contentResources: {
    listForExam: vi.fn(async () => tree),
    watchSummary: vi.fn(async () => watch),
    recordView: vi.fn(),
    signDocument: vi.fn(async () => "https://signed"),
  },
  fetchStudyReadiness: vi.fn(async () => readiness),
}));

function renderHub() {
  return render(
    <MemoryRouter initialEntries={["/exams/e-1/content"]}>
      <Routes>
        <Route path="/exams/:examId/content" element={<ExamContent />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("ExamContent hub", () => {
  test("renders subject + topic + resources", async () => {
    renderHub();
    expect(await screen.findByText("Physics")).toBeInTheDocument();
    // "Kinematics" appears as the topic heading and the revise-panel row.
    expect(screen.getAllByText("Kinematics").length).toBeGreaterThanOrEqual(1);
    // "Motion graphs" appears in the topic grid and the continue strip.
    expect(screen.getAllByText("Motion graphs").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Kinematics sheet")).toBeInTheDocument();
  });

  test("revise panel shows overdue HIGH row", async () => {
    renderHub();
    expect(await screen.findByText("Revise these topics")).toBeInTheDocument();
    expect(screen.getByText("HIGH")).toBeInTheDocument();
    expect(screen.getByText(/9d overdue/)).toBeInTheDocument();
  });

  test("continue-watching shows resume %", async () => {
    renderHub();
    expect(await screen.findByText("Continue watching")).toBeInTheDocument();
    expect(screen.getByText(/50% · resume/)).toBeInTheDocument();
  });

  test("clicking a video opens the player", async () => {
    renderHub();
    await screen.findByText("Physics");
    // Click the topic-grid card (last match; the strip card is first).
    const matches = screen.getAllByText("Motion graphs");
    fireEvent.click(matches[matches.length - 1]);
    await waitFor(() =>
      expect(screen.getByTestId("video-player")).toBeInTheDocument(),
    );
  });

  test("clicking a document opens the viewer", async () => {
    renderHub();
    fireEvent.click(await screen.findByText("Kinematics sheet"));
    await waitFor(() =>
      expect(screen.getByTestId("doc-viewer")).toBeInTheDocument(),
    );
  });
});
