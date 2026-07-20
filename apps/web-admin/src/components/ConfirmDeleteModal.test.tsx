import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";

describe("ConfirmDeleteModal", () => {
  it("keeps Delete disabled until the code is typed exactly", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDeleteModal examName="Class 7" examCode="CLASS7"
        onConfirm={onConfirm} onCancel={() => {}} />,
    );
    const btn = screen.getByRole("button", { name: /delete permanently/i });
    expect(btn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type the exam code/i), {
      target: { value: "wrong" },
    });
    expect(btn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type the exam code/i), {
      target: { value: "CLASS7" },
    });
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("invokes onCancel from the Cancel button", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDeleteModal examName="Class 7" examCode="CLASS7"
        onConfirm={() => {}} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
