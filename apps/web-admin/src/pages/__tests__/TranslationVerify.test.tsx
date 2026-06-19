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

import { reviewQueue } from "../../lib/translation-workbench-api";
import { TranslationVerify } from "../TranslationVerify";

const mockList = reviewQueue.list as unknown as ReturnType<typeof vi.fn>;
const mockBulk = reviewQueue.bulk as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockList.mockReset();
  mockBulk.mockReset();
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
});
