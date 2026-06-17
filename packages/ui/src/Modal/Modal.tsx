// Modal — Aurora molecule.
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.2
//
// Centered dialog over a dimmed backdrop. Uses the native
// <dialog showModal()> API for built-in focus-trap, ESC handling,
// and modal stacking. Replaces ad-hoc modal markup (PaywallModal,
// ShareTestModal) with one canonical primitive.
//
// API:
//   <Modal open onClose={...} title="Pay to continue">
//     <p>...</p>
//     <Modal.Footer>
//       <Button variant="secondary" onClick={onClose}>Cancel</Button>
//       <Button onClick={onConfirm}>Confirm</Button>
//     </Modal.Footer>
//   </Modal>

import React, { forwardRef, useEffect, useRef } from "react";
import { cn } from "../utils/cn";

export interface ModalProps extends Omit<React.DialogHTMLAttributes<HTMLDialogElement>, "open" | "title"> {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** When true, clicking the backdrop closes the modal. Default true. */
  closeOnBackdrop?: boolean;
  children?: React.ReactNode;
}

interface ModalFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

interface ModalRoot
  extends React.ForwardRefExoticComponent<
    ModalProps & React.RefAttributes<HTMLDialogElement>
  > {
  Footer: React.FC<ModalFooterProps>;
}

const ModalImpl = forwardRef<HTMLDialogElement, ModalProps>(function Modal(
  {
    open,
    onClose,
    title,
    description,
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
      className={cn("alp-modal", `alp-modal--${size}`, className)}
      onCancel={(e) => {
        e.preventDefault(); // we control close
        onClose();
      }}
      onClick={(e) => {
        if (!closeOnBackdrop) return;
        // Native <dialog> click target is the dialog itself when the user
        // clicks the backdrop; clicks inside the content land on children.
        if (e.target === innerRef.current) onClose();
      }}
      {...rest}
    >
      <div className="alp-modal__panel" role="document">
        {title || description ? (
          <header className="alp-modal__header">
            {title ? <h2 className="alp-modal__title">{title}</h2> : null}
            {description ? <p className="alp-modal__description">{description}</p> : null}
          </header>
        ) : null}
        <div className="alp-modal__body">{children}</div>
      </div>
    </dialog>
  );
}) as ModalRoot;

const Footer: React.FC<ModalFooterProps> = ({ className, children, ...rest }) => (
  <div className={cn("alp-modal__footer", className)} {...rest}>
    {children}
  </div>
);

ModalImpl.Footer = Footer;

export const Modal = ModalImpl;
