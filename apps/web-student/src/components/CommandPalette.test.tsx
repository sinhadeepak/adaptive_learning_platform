// CommandPalette smoke tests (Phase 6 S58).

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import { CommandPalette } from "./CommandPalette";
import { ConfidenceCalibrationCard, bucketFor } from "./ConfidenceCalibrationCard";
import { DoubtPracticeBridge } from "./DoubtPracticeBridge";

function withRouter(node: React.ReactNode) {
  return (
    <MemoryRouter initialEntries={["/start"]}>
      <Routes>
        <Route path="/start" element={node} />
        <Route path="/home" element={<div>home page</div>} />
        <Route path="/insights" element={<div>insights page</div>} />
        <Route
          path="/catalog/topic/:id"
          element={<div>topic page</div>}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("CommandPalette", () => {
  test("closed by default, opens on Cmd+K", async () => {
    render(withRouter(<CommandPalette />));
    expect(screen.queryByLabelText("Command palette")).toBeNull();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() =>
      expect(screen.getByLabelText("Command palette")).toBeInTheDocument(),
    );
  });

  test("Ctrl+K also toggles (non-Mac users)", async () => {
    render(withRouter(<CommandPalette />));
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await waitFor(() =>
      expect(screen.getByLabelText("Command palette")).toBeInTheDocument(),
    );
  });

  test("filters items as the user types + empty state on no match", async () => {
    render(withRouter(<CommandPalette />));
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() =>
      expect(screen.getByLabelText("Command query")).toBeInTheDocument(),
    );
    const input = screen.getByLabelText("Command query");
    fireEvent.change(input, { target: { value: "insights" } });
    expect(screen.getByText("Insights hub")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "asdfgh" } });
    expect(screen.getByText(/No matches/)).toBeInTheDocument();
  });

  test("Enter on the active item navigates", async () => {
    render(withRouter(<CommandPalette />));
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() =>
      expect(screen.getByLabelText("Command query")).toBeInTheDocument(),
    );
    const input = screen.getByLabelText("Command query");
    fireEvent.change(input, { target: { value: "home" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByText("home page")).toBeInTheDocument(),
    );
  });

  test("Escape closes the palette", async () => {
    render(withRouter(<CommandPalette />));
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() =>
      expect(screen.getByLabelText("Command palette")).toBeInTheDocument(),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByLabelText("Command palette")).toBeNull(),
    );
  });
});

describe("ConfidenceCalibrationCard", () => {
  test("bucketFor maps aligned / over / under", () => {
    expect(
      bucketFor({ key: "a", confidence: 0.6, accuracy: 0.62, n: 5 }),
    ).toBe("aligned");
    expect(
      bucketFor({ key: "b", confidence: 0.85, accuracy: 0.55, n: 5 }),
    ).toBe("overconfident");
    expect(
      bucketFor({ key: "c", confidence: 0.35, accuracy: 0.75, n: 5 }),
    ).toBe("underconfident");
  });

  test("empty rows + hideWhenEmpty=true returns null", () => {
    const { container } = render(
      <ConfidenceCalibrationCard rows={[]} hideWhenEmpty />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("empty rows default renders empty-state copy", () => {
    render(<ConfidenceCalibrationCard rows={[]} />);
    expect(
      screen.getByText(/Rate your confidence on a few practice items/),
    ).toBeInTheDocument();
  });

  test("populated rows render bucket pills + meta", () => {
    render(
      <ConfidenceCalibrationCard
        rows={[
          { key: "concept-a", confidence: 0.85, accuracy: 0.55, n: 8 },
          { key: "concept-b", confidence: 0.55, accuracy: 0.58, n: 7 },
        ]}
      />,
    );
    expect(screen.getByText("Overconfident")).toBeInTheDocument();
    expect(screen.getByText("Aligned")).toBeInTheDocument();
    expect(screen.getByText("conf 85%")).toBeInTheDocument();
    expect(screen.getByText("acc 55%")).toBeInTheDocument();
  });
});

describe("DoubtPracticeBridge", () => {
  test("renders nothing when topicId missing", () => {
    const { container } = render(
      withRouter(<DoubtPracticeBridge topicId={null} resolved />),
    );
    expect(container.querySelector(".dpb-card")).toBeNull();
  });

  test("renders nothing when unresolved", () => {
    const { container } = render(
      withRouter(<DoubtPracticeBridge topicId="t-1" resolved={false} />),
    );
    expect(container.querySelector(".dpb-card")).toBeNull();
  });

  test("renders CTA when resolved + topicId present", () => {
    render(
      withRouter(
        <DoubtPracticeBridge topicId="t-1" topicTitle="Newton 3rd law" resolved />,
      ),
    );
    expect(
      screen.getByText(/Practice this · Newton 3rd law/),
    ).toBeInTheDocument();
    const cta = screen.getByText(/Start a 5-question retrieval round/);
    expect(cta.closest("a")?.getAttribute("href")).toBe(
      "/catalog/topic/t-1",
    );
  });
});
