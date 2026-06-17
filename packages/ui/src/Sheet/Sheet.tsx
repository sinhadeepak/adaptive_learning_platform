// Sheet — Aurora molecule.
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.2
//
// Side-anchored or bottom-anchored slide-over.
//   * side="right"  — desktop drawers (Catalog filters, Profile detail)
//   * side="left"   — mobile nav drawer (rare; we prefer MobileTabBar)
//   * side="bottom" — mobile primary mode (replaces Drawer at <md)
//
// Uses native <dialog showModal()> like Modal for focus-trap + ESC.
// Transform animations are CSS-driven via [data-state="open|closed"].

import React, { forwardRef, useEffect, useRef } from "react";
import { cn } from "../utils/cn";

export type SheetSide = "left" | "right" | "bottom";

export interface SheetProps
  extends Omit<React.DialogHTMLAttributes<HTMLDialogElement>, "open" | "title"> {
  open: boolean;
  onClose: () => void;
  side?: SheetSide;
  title?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** When true, clicking the backdrop closes the sheet. Default true. */
  closeOnBackdrop?: boolean;
  children?: React.ReactNode;
}

export const Sheet = forwardRef<HTMLDialogElement, SheetProps>(function Sheet(
  {
    open,
    onClose,
    side = "right",
    title,
    size = "md",
    closeOnBackdrop = true,
    className,
    children,
    ...rest
  },
  ref,
) {
  const innerRef = useRef<HTMLDialogElement | null>(null);
  const setRef = (el: HTMLDialogElement | null) => {
    innerRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLDialogElement | null>).current = el;
  };
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    if (open && !el.open) {
      try { el.showModal(); } catch { /* not connected yet */ }
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  return (
    <dialog
      ref={setRef}
      className={cn("alp-sheet", `alp-sheet--${side}`, `alp-sheet--${size}`, className)}
      data-state={open ? "open" : "closed"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (!closeOnBackdrop) return;
        if (e.target === innerRef.current) onClose();
      }}
      {...rest}
    >
      <div className="alp-sheet__panel" role="document">
        {title ? (
          <header className="alp-sheet__header">
            <h2 className="alp-sheet__title">{title}</h2>
          </header>
        ) : null}
        <div className="alp-sheet__body">{children}</div>
      </div>
    </dialog>
  );
});
