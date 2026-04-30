// Sprint 33 (P4-S33) — pure helpers for the Goals.tsx trajectory UI.

export type TrajectoryStatus = "on_track" | "behind" | "ahead" | "no_target";
export type Priority = "foundation" | "drill" | "peaking" | "no_target";

export interface WeeklyActions {
  priority: Priority;
  weeklyMockTarget: number;
  weeklyMinutesTarget: number;
  dailyTopicsTarget: number;
}

export interface TrajectoryResp {
  trajectoryStatus: TrajectoryStatus;
  currentReadiness: number;
  targetRank: number | null;
  weeksToExam: number;
  readinessGap: number;
  actions: WeeklyActions;
  headline: string;
}

/** Token-coloured trajectory pill. */
export function trajectoryColour(status: TrajectoryStatus): string {
  switch (status) {
    case "on_track":
      return "var(--color-blue, #4F87F6)";
    case "ahead":
      return "var(--color-green, #10C47A)";
    case "behind":
      return "var(--color-amber, #F5A623)";
    case "no_target":
      return "var(--text-muted, #7A8BAD)";
  }
}

/** Three short copy lines for the weekly-actions panel. */
export function weeklyActionsCopy(actions: WeeklyActions): string[] {
  if (actions.priority === "no_target") {
    return ["Set a target rank to see your weekly plan."];
  }
  const minutesPerDay = Math.round(actions.weeklyMinutesTarget / 7);
  return [
    `Take ${actions.weeklyMockTarget} full-length mock${actions.weeklyMockTarget === 1 ? "" : "s"} this week.`,
    `Aim for ${minutesPerDay} minutes/day of focused study (${actions.weeklyMinutesTarget} min/week).`,
    `Drill ${actions.dailyTopicsTarget} weak topic${actions.dailyTopicsTarget === 1 ? "" : "s"} per day.`,
  ];
}
