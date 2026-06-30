import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotesPanel } from "./NotesPanel";

vi.mock("./NoteEditor", () => ({
  NoteEditor: ({ onChange }: { onChange: (d: unknown) => void }) => (
    <button onClick={() => onChange({ type: "doc", content: [{ type: "paragraph" }] })}>
      edit-body
    </button>
  ),
}));

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../../lib/userNotes-api", () => ({ userNotes: api }));

beforeEach(() => {
  vi.useFakeTimers();
  api.list.mockResolvedValue([{ id: "n1", title: "First", updated_at: "t" }]);
  api.get.mockResolvedValue({ id: "n1", exam_id: "e1", title: "First", body: {},
    created_at: "c", updated_at: "t" });
  api.update.mockResolvedValue({ id: "n1", exam_id: "e1", title: "First", body: {},
    created_at: "c", updated_at: "t2" });
  api.create.mockResolvedValue({ id: "n2", exam_id: "e1", title: "Untitled note", body: {},
    created_at: "c", updated_at: "t" });
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("NotesPanel", () => {
  it("lists notes for the exam on mount", async () => {
    render(<NotesPanel examId="e1" />);
    await waitFor(() => expect(api.list).toHaveBeenCalledWith("e1"));
    expect(await screen.findByText("First")).toBeInTheDocument();
  });

  it("debounces body edits into a single update PUT", async () => {
    render(<NotesPanel examId="e1" />);
    await waitFor(() => expect(api.get).toHaveBeenCalled()); // first note auto-opened
    fireEvent.click(screen.getByText("edit-body"));
    fireEvent.click(screen.getByText("edit-body"));
    fireEvent.click(screen.getByText("edit-body"));
    expect(api.update).not.toHaveBeenCalled(); // debounced
    await vi.advanceTimersByTimeAsync(1100);
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it("creates a new note", async () => {
    render(<NotesPanel examId="e1" />);
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /new note/i }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith("e1"));
  });
});
