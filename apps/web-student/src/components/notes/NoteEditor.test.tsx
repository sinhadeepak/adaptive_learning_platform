import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoteEditor } from "./NoteEditor";

vi.mock("../../lib/noteImages", () => ({
  uploadNoteImage: vi.fn(),
  signObjectKey: vi.fn(async () => "http://signed"),
}));

describe("NoteEditor", () => {
  it("renders the formatting toolbar", () => {
    render(<NoteEditor value={null} onChange={() => {}} />);
    expect(screen.getByText("H2")).toBeInTheDocument();
    expect(screen.getByText("• List")).toBeInTheDocument();
  });
});
