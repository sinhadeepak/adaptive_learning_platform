// @alp/ui — Vidya v1 primitives package (formerly Aurora v2).
//
// Public surface. Tree-shake-friendly named exports per primitive.
// CSS is shipped separately as `@alp/ui/ui.css` — consumers must import
// it once (typically in their app entry) for primitives to render.
//
// Spec: docs/02-design/design-system/04_components.md (Vidya · 14 components)
// ADR:  docs/adr/0029-component-primitives-package.md (superseded by
//       ADR-0034 Vidya design-system v3)

// ── Atoms ──
export { Button } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";

export { Tag } from "./Tag";
export type { TagProps, TagTone, TagVariant, TagSize } from "./Tag";

export { Avatar } from "./Avatar";
export type { AvatarProps, AvatarSize, AvatarStatus } from "./Avatar";

export { Skeleton } from "./Skeleton";
export type { SkeletonProps, SkeletonShape } from "./Skeleton";

export { Checkbox } from "./Checkbox";
export type { CheckboxProps } from "./Checkbox";

export { Input } from "./Input";
export type { InputProps, InputSize, InputState } from "./Input";

// ── Molecules ──
export { Card } from "./Card";
export type { CardProps, CardSurface, CardPadding, CardTone } from "./Card";

export { FormField } from "./FormField";
export type { FormFieldProps } from "./FormField";

export { Tabs, TabList, Tab, TabPanel } from "./Tabs";
export type { TabsProps, TabsVariant, TabListProps, TabProps, TabPanelProps } from "./Tabs";

export { Modal } from "./Modal";
export type { ModalProps } from "./Modal";

export { Sheet } from "./Sheet";
export type { SheetProps, SheetSide } from "./Sheet";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

// ── Organisms ──
export { TopBar } from "./TopBar";
export type { TopBarProps } from "./TopBar";

export { NavSidebar } from "./NavSidebar";
export type { NavSidebarProps, NavSidebarItem, NavSidebarGroup } from "./NavSidebar";

export { MobileTabBar } from "./MobileTabBar";
export type { MobileTabBarProps, MobileTabBarItem } from "./MobileTabBar";

export { AppShell } from "./AppShell";
export type { AppShellProps } from "./AppShell";

// ── Domain organisms ──
export { ProgressRing } from "./ProgressRing";
export type { ProgressRingProps, ProgressRingTone } from "./ProgressRing";

export { StatCard } from "./StatCard";
export type { StatCardProps, StatCardTone } from "./StatCard";

export { AIInsightCard } from "./AIInsightCard";
export type { AIInsightCardProps } from "./AIInsightCard";

export { StreakChip } from "./StreakChip";
export type { StreakChipProps } from "./StreakChip";

// ── Vidya v1 additions (gold AI signal, mastery bars, sparkline) ──
export { AiTag } from "./AiTag";
export type { AiTagProps } from "./AiTag";

export { MasteryBar, MasteryStack } from "./MasteryBar";
export type {
  MasteryBarProps,
  MasteryBarSize,
  MasteryStackProps,
  MasteryStackCounts,
} from "./MasteryBar";

export { Sparkline } from "./Sparkline";
export type { SparklineProps } from "./Sparkline";

// ── Utilities ──
export { cn } from "./utils/cn";
