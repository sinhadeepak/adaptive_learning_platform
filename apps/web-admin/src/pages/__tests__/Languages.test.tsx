// apps/web-admin/src/pages/__tests__/Languages.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/translation-workbench-api", () => ({
  languages: { list: vi.fn(), upsert: vi.fn(), patch: vi.fn() },
}));
vi.mock("../../components/AdminShell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { languages } from "../../lib/translation-workbench-api";
import { Languages } from "../Languages";

const mockList = languages.list as unknown as ReturnType<typeof vi.fn>;
const mockPatch = languages.patch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockList.mockReset();
  mockPatch.mockReset();
});

describe("Languages", () => {
  it("lists languages and toggles enabled", async () => {
    mockList.mockResolvedValue([
      { code: "en", name: "English", nativeName: "English", script: "Latin", enabled: true, isSource: true, sortOrder: 0 },
      { code: "hi", name: "Hindi", nativeName: "हिन्दी", script: "Devanagari", enabled: true, isSource: false, sortOrder: 10 },
    ]);
    mockPatch.mockResolvedValue({ code: "hi", enabled: false });
    render(<Languages />);
    await waitFor(() => expect(screen.getByText("Hindi")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("toggle hi"));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith("hi", { enabled: false }));
  });
});
