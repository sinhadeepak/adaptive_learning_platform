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

  it("does not throw and renders toolbar when value is an empty object (new note body default)", () => {
    // A newly-created note has body = {} (the DB column default). Passing it as
    // the value must NOT crash TipTap with RangeError: Invalid input for Node.fromJSON.
    render(<NoteEditor value={{} as never} onChange={() => {}} />);
    expect(screen.getByText("H2")).toBeInTheDocument();
  });
});
