// apps/web-admin/src/pages/__tests__/TranslationVerify.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/translation-workbench-api", () => ({
  reviewQueue: { list: vi.fn(), bulk: vi.fn() },
  translationEdit: { save: vi.fn() },
}));
vi.mock("../../components/AdminShell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../lib/auth-provider", () => ({
  useAuth: () => ({ user: { id: "rev-1" } }),
}));

import { reviewQueue, translationEdit } from "../../lib/translation-workbench-api";
import { TranslationVerify } from "../TranslationVerify";
import { setAtPath } from "../../components/PayloadDiff";

const mockList = reviewQueue.list as unknown as ReturnType<typeof vi.fn>;
const mockBulk = reviewQueue.bulk as unknown as ReturnType<typeof vi.fn>;
const mockSave = translationEdit.save as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockList.mockReset();
  mockBulk.mockReset();
  mockSave.mockReset();
});

describe("setAtPath", () => {
  it("sets a nested indexed path without mutating the original", () => {
    const original = { options: [{ id: "A", text: "old" }] };
    const result = setAtPath(original, "options[0].text", "new");

    expect(result).toEqual({ options: [{ id: "A", text: "new" }] });
    // original must not be mutated
    expect(original.options[0].text).toBe("old");
  });

  it("sets a top-level path", () => {
    const original = { stem: "original stem" };
    const result = setAtPath(original, "stem", "updated stem");
    expect(result).toEqual({ stem: "updated stem" });
    expect(original.stem).toBe("original stem");
  });

  it("does not produce a flat spurious key for nested paths", () => {
    const original = { options: [{ id: "A", text: "old" }] };
    const result = setAtPath(original, "options[0].text", "new");
    expect(Object.keys(result)).not.toContain("options[0].text");
    expect((result.options as Array<{ text: string }>)[0].text).toBe("new");
  });
});

describe("TranslationVerify", () => {
  it("lists drafts and bulk-approves selected", async () => {
    mockList.mockResolvedValue({
      items: [{
        questionId: "q1", language: "hi", status: "DRAFT", aiConfidence: 0.9, version: 1,
        culturalFlags: [], stem: "Stem", sourcePayload: { stem: "Stem" },
        payloadTranslation: { stem: "अनुवाद" }, translatablePaths: ["stem"],
      }],
      total: 1,
    });
    mockBulk.mockResolvedValue({ results: [{ questionId: "q1", lang: "hi", ok: true }] });

    render(<MemoryRouter><TranslationVerify /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Stem")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Select q1 hi"));
    fireEvent.click(screen.getByText(/Approve & Publish/));

    await waitFor(() =>
      expect(mockBulk).toHaveBeenCalledWith(
        [{ questionId: "q1", lang: "hi", action: "approve" }], "rev-1"),
    );
  });

  it("sends a properly nested payload when editing an MCQ option path", async () => {
    mockList.mockResolvedValue({
      items: [{
        questionId: "q2", language: "ta", status: "DRAFT", aiConfidence: 0.8, version: 1,
        culturalFlags: [],
        stem: "Question stem",
        sourcePayload: { stem: "Question stem", options: [{ id: "A", text: "Option A" }] },
        payloadTranslation: { stem: "கேள்வி", options: [{ id: "A", text: "விருப்பம் A" }] },
        translatablePaths: ["stem", "options[*].text"],
      }],
      total: 1,
    });
    mockSave.mockResolvedValue({});

    render(<MemoryRouter><TranslationVerify /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Question stem")).toBeInTheDocument());

    // Open the diff panel for q2
    fireEvent.click(screen.getByText("Diff"));

    // Edit the nested option path
    const textarea = await waitFor(() => screen.getByLabelText("edit options[0].text"));
    fireEvent.blur(textarea, { target: { value: "Updated option A" } });

    await waitFor(() => expect(mockSave).toHaveBeenCalled());

    const [, , savedPayload] = mockSave.mock.calls[0] as [string, string, Record<string, unknown>];

    // Must NOT have a flat key "options[0].text"
    expect(Object.keys(savedPayload)).not.toContain("options[0].text");
    // Must have properly nested structure
    const opts = savedPayload.options as Array<{ id: string; text: string }>;
    expect(opts[0].text).toBe("Updated option A");
  });
});
