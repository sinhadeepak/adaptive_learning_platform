// Tabs — Aurora molecule.
//
// Spec: docs/02-design/design-system-v2-aurora.md §7.2
//
// Headless ARIA-compliant tabs. Two visual variants:
//   * underlined — sliding underline (Home page, Topic detail)
//   * pill       — rounded pill highlight (Catalog filters, Settings)
//   * segmented  — segmented-control feel (Density/Theme picker)
//
// Keyboard:
//   ArrowLeft / ArrowRight cycle tabs
//   Home / End jump to first / last
//   Enter / Space activate (manual activation when `activateOnFocus={false}`)
//
// `value` may be controlled or uncontrolled (`defaultValue`).

import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "../utils/cn";

export type TabsVariant = "underlined" | "pill" | "segmented";

interface TabsCtx {
  value: string;
  setValue: (v: string) => void;
  variant: TabsVariant;
  baseId: string;
  activateOnFocus: boolean;
  registerTabRef: (key: string, el: HTMLButtonElement | null) => void;
  focusNeighbor: (currentKey: string, dir: 1 | -1 | "first" | "last") => void;
}

const Ctx = createContext<TabsCtx | null>(null);

function useTabs(): TabsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("Tab* must render inside <Tabs>");
  return c;
}

export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  variant?: TabsVariant;
  /** When true (default), arrow-key navigation also activates the tab. */
  activateOnFocus?: boolean;
}

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  {
    value: controlled,
    defaultValue,
    onValueChange,
    variant = "underlined",
    activateOnFocus = true,
    className,
    children,
    ...rest
  },
  ref,
) {
  const [uncontrolled, setUncontrolled] = useState<string>(defaultValue ?? "");
  const isControlled = controlled !== undefined;
  const value = isControlled ? controlled : uncontrolled;
  const baseId = useId();

  const setValue = useCallback(
    (v: string) => {
      if (!isControlled) setUncontrolled(v);
      onValueChange?.(v);
    },
    [isControlled, onValueChange],
  );

  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const tabOrder = useRef<string[]>([]);

  const registerTabRef = useCallback((key: string, el: HTMLButtonElement | null) => {
    if (el) {
      tabRefs.current.set(key, el);
      if (!tabOrder.current.includes(key)) tabOrder.current.push(key);
    } else {
      tabRefs.current.delete(key);
      tabOrder.current = tabOrder.current.filter((k) => k !== key);
    }
  }, []);

  const focusNeighbor = useCallback(
    (currentKey: string, dir: 1 | -1 | "first" | "last") => {
      const order = tabOrder.current;
      if (order.length === 0) return;
      let nextKey: string | undefined;
      if (dir === "first") nextKey = order[0];
      else if (dir === "last") nextKey = order[order.length - 1];
      else {
        const idx = order.indexOf(currentKey);
        const nextIdx = (idx + dir + order.length) % order.length;
        nextKey = order[nextIdx];
      }
      if (nextKey) {
        tabRefs.current.get(nextKey)?.focus();
        if (activateOnFocus) setValue(nextKey);
      }
    },
    [activateOnFocus, setValue],
  );

  const ctx = useMemo<TabsCtx>(
    () => ({ value, setValue, variant, baseId, activateOnFocus, registerTabRef, focusNeighbor }),
    [value, setValue, variant, baseId, activateOnFocus, registerTabRef, focusNeighbor],
  );

  return (
    <Ctx.Provider value={ctx}>
      <div
        ref={ref}
        className={cn("alp-tabs", `alp-tabs--${variant}`, className)}
        {...rest}
      >
        {children}
      </div>
    </Ctx.Provider>
  );
});

export interface TabListProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
}

export const TabList = forwardRef<HTMLDivElement, TabListProps>(function TabList(
  { label, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      className={cn("alp-tabs__list", className)}
      {...rest}
    >
      {children}
    </div>
  );
});

export interface TabProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  /** Value that becomes selected when this tab is activated. */
  value: string;
}

export const Tab = forwardRef<HTMLButtonElement, TabProps>(function Tab(
  { value, className, onClick, onKeyDown, children, ...rest },
  ref,
) {
  const { value: active, setValue, baseId, registerTabRef, focusNeighbor } = useTabs();
  const selected = active === value;
  const tabId = `${baseId}-tab-${value}`;
  const panelId = `${baseId}-panel-${value}`;

  const composedRef = useCallback(
    (el: HTMLButtonElement | null) => {
      registerTabRef(value, el);
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = el;
    },
    [ref, registerTabRef, value],
  );

  return (
    <button
      ref={composedRef}
      type="button"
      role="tab"
      id={tabId}
      aria-controls={panelId}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      className={cn(
        "alp-tabs__tab",
        selected && "alp-tabs__tab--selected",
        className,
      )}
      onClick={(e) => {
        setValue(value);
        onClick?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          focusNeighbor(value, 1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          focusNeighbor(value, -1);
        } else if (e.key === "Home") {
          e.preventDefault();
          focusNeighbor(value, "first");
        } else if (e.key === "End") {
          e.preventDefault();
          focusNeighbor(value, "last");
        }
        onKeyDown?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
});

export interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const TabPanel = forwardRef<HTMLDivElement, TabPanelProps>(function TabPanel(
  { value, className, children, ...rest },
  ref,
) {
  const { value: active, baseId } = useTabs();
  const selected = active === value;
  const panelId = `${baseId}-panel-${value}`;
  const tabId = `${baseId}-tab-${value}`;
  if (!selected) return null;
  return (
    <div
      ref={ref}
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      tabIndex={0}
      className={cn("alp-tabs__panel", className)}
      {...rest}
    >
      {children}
    </div>
  );
});
