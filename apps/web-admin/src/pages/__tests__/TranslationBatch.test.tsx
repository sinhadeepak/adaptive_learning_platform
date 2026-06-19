// apps/web-admin/src/pages/__tests__/TranslationBatch.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/translation-workbench-api", () => ({
  batches: { get: vi.fn(), retryTask: vi.fn() },
}));
vi.mock("../../components/AdminShell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { batches } from "../../lib/translation-workbench-api";
import { TranslationBatch } from "../TranslationBatch";

const mockGet = batches.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => mockGet.mockReset());

describe("TranslationBatch", () => {
  it("shows progress counters from the batch", async () => {
    mockGet.mockResolvedValue({
      batch: { id: "b1", status: "DONE", totalTasks: 3, doneTasks: 2, failedTasks: 1,
               targetLangs: ["hi"], subject: "general", createdAt: "2026-06-17T00:00:00Z", finishedAt: null },
      tasks: [{ id: "t1", questionId: "q1", language: "hi", status: "SUCCEEDED", error: null, version: 1, stem: "S1" }],
    });
    render(
      <MemoryRouter initialEntries={["/translation-batches/b1"]}>
        <Routes>
          <Route path="/translation-batches/:batchId" element={<TranslationBatch />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/2/)).toBeInTheDocument());
    expect(mockGet).toHaveBeenCalledWith("b1");
  });
});
