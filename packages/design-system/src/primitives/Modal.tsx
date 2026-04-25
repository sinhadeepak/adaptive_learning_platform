import { useCallback, useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { colors } from "../tokens/colors";
import { radius } from "../tokens/shape";
import { elevation } from "../tokens/elevation";
import { spacing } from "../tokens/spacing";
import { typography } from "../tokens/typography";

export type ModalSize = "sm" | "md" | "lg" | "xl";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  dismissOnEscape?: boolean;
  dismissOnOverlayClick?: boolean;
}

const WIDTH: Record<ModalSize, number> = { sm: 400, md: 560, lg: 720, xl: 960 };

const FOCUSABLE = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissOnEscape = true,
  dismissOnOverlayClick = true,
}: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Focus trap + initial focus + restore on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (!panel) return;
    const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? panel).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissOnEscape) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus();
    };
  }, [open, dismissOnEscape, onClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (!dismissOnOverlayClick) return;
      if (e.target === e.currentTarget) onClose();
    },
    [dismissOnOverlayClick, onClose]
  );

  if (!open) return null;

  const overlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[4],
    zIndex: 50,
  };

  const panelStyle: CSSProperties = {
    width: "100%",
    maxWidth: WIDTH[size],
    maxHeight: "calc(100vh - 48px)",
    background: colors.surface.primary,
    borderRadius: radius.modal,
    boxShadow: elevation.dropdown,
    display: "flex",
    flexDirection: "column",
    fontFamily: typography.family.ui,
    outline: "none",
  };

  const headerStyle: CSSProperties = {
    padding: spacing[6],
    paddingBottom: spacing[4],
  };

  const bodyStyle: CSSProperties = {
    padding: `0 ${spacing[6]}px`,
    flex: 1,
    overflow: "auto",
    color: colors.text.primary,
  };

  const footerStyle: CSSProperties = {
    padding: spacing[6],
    paddingTop: spacing[4],
    display: "flex",
    justifyContent: "flex-end",
    gap: spacing[3],
  };

  const titleStyle: CSSProperties = {
    margin: 0,
    fontSize: typography.scale.pageTitle.size,
    fontWeight: typography.scale.pageTitle.weight,
    color: colors.text.primary,
  };

  const descStyle: CSSProperties = {
    marginTop: spacing[2],
    marginBottom: 0,
    color: colors.text.secondary,
    fontSize: typography.scale.body.size,
  };

  return createPortal(
    <div style={overlayStyle} onClick={handleOverlayClick} role="presentation">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        style={panelStyle}
      >
        <div style={headerStyle}>
          <h2 id={titleId} style={titleStyle}>
            {title}
          </h2>
          {description ? (
            <p id={descId} style={descStyle}>
              {description}
            </p>
          ) : null}
        </div>
        <div style={bodyStyle}>{children}</div>
        {footer ? <div style={footerStyle}>{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
