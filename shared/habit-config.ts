import { z } from "zod";

export const HABIT_TRACKING_TYPES = ["yes_no", "quantifiable"] as const;
export const HABIT_FREQUENCY_PERIODS = ["day", "week", "month", "quarter", "year"] as const;
export const HABIT_QUANT_UNIT_PRESETS = ["count", "km", "hours", "minutes", "time_of_day", "custom"] as const;
export const HABIT_GOAL_TYPES = ["at_least", "at_most"] as const;
export const HABIT_LOG_STATUSES = ["clear", "done", "skipped", "recorded"] as const;

export const habitTrackingTypeSchema = z.enum(HABIT_TRACKING_TYPES);
export const habitFrequencyPeriodSchema = z.enum(HABIT_FREQUENCY_PERIODS);
export const habitQuantUnitPresetSchema = z.enum(HABIT_QUANT_UNIT_PRESETS);
export const habitGoalTypeSchema = z.enum(HABIT_GOAL_TYPES);
export const habitLogStatusSchema = z.enum(HABIT_LOG_STATUSES);

export type HabitTrackingType = (typeof HABIT_TRACKING_TYPES)[number];
export type HabitFrequencyPeriod = (typeof HABIT_FREQUENCY_PERIODS)[number];
export type HabitQuantUnitPreset = (typeof HABIT_QUANT_UNIT_PRESETS)[number];
export type HabitGoalType = (typeof HABIT_GOAL_TYPES)[number];
export type HabitLogStatus = (typeof HABIT_LOG_STATUSES)[number];

export type HabitLikeForRules = {
  trackingType?: string | null;
  frequencyCount?: number | null;
  frequencyPeriod?: string | null;
  quantUnitPreset?: string | null;
  quantUnitCustom?: string | null;
  quantTargetValue?: string | null;
  quantGoalType?: string | null;
};

export type HabitLogLikeForRules = {
  status?: string | null;
  completed?: boolean | null;
  valueText?: string | null;
};

export function getHabitTrackingType(habit: HabitLikeForRules): HabitTrackingType {
  return habit.trackingType === "quantifiable" ? "quantifiable" : "yes_no";
}

export function getHabitFrequencyPeriod(habit: HabitLikeForRules): HabitFrequencyPeriod {
  return habitFrequencyPeriodSchema.safeParse(habit.frequencyPeriod).success
    ? (habit.frequencyPeriod as HabitFrequencyPeriod)
    : "day";
}

export function getHabitFrequencyCount(habit: HabitLikeForRules) {
  const count = Number(habit.frequencyCount ?? 1);
  if (!Number.isFinite(count)) return 1;
  return Math.max(1, Math.floor(count));
}

export function getHabitLogStatus(log: HabitLogLikeForRules | null | undefined): HabitLogStatus {
  if (!log) return "clear";
  if (log.status === "done" || log.status === "skipped" || log.status === "recorded" || log.status === "clear") {
    return log.status;
  }
  return log.completed ? "done" : "clear";
}

export function isHabitLogDone(log: HabitLogLikeForRules | null | undefined) {
  return getHabitLogStatus(log) === "done";
}

export function isHabitLogSkipped(log: HabitLogLikeForRules | null | undefined) {
  return getHabitLogStatus(log) === "skipped";
}

export function isHabitLogRecordedOnly(log: HabitLogLikeForRules | null | undefined) {
  return getHabitLogStatus(log) === "recorded";
}

export function hasHabitLogValue(log: HabitLogLikeForRules | null | undefined) {
  return typeof log?.valueText === "string" && log.valueText.trim().length > 0;
}

export function getHabitUnitLabel(habit: HabitLikeForRules) {
  const preset = habit.quantUnitPreset;
  if (preset === "custom") {
    return habit.quantUnitCustom?.trim() || "unit";
  }
  switch (preset) {
    case "km":
      return "km";
    case "hours":
      return "h";
    case "minutes":
      return "min";
    case "time_of_day":
      return "HH:mm";
    case "count":
    default:
      return "unit";
  }
}

const TIME_OF_DAY_VALUE_REGEX =
  /^([01]\d|2[0-3]):([0-5]\d)(?:\s*(?:\(\s*\+?1\s*\)|\+1|next\s*day|the\s*next\s*day))?$/i;

export function parseTimeOfDayValueText(rawValue: string | null | undefined) {
  if (typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  const match = trimmed.match(TIME_OF_DAY_VALUE_REGEX);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const normalizedBase = `${match[1]}:${match[2]}`;
  const suffixRaw = trimmed.slice(match[0].indexOf(normalizedBase) + normalizedBase.length).trim();
  const isNextDay = suffixRaw.length > 0;
  const totalMinutes = hours * 60 + minutes + (isNextDay ? 24 * 60 : 0);

  return {
    hours,
    minutes,
    timeText: normalizedBase,
    isNextDay,
    totalMinutes,
  };
}

export function formatTimeOfDayValueText(timeText: string, isNextDay: boolean) {
  const trimmed = timeText.trim();
  if (!trimmed) return "";
  return isNextDay ? `${trimmed} +1` : trimmed;
}

export function formatComparableMinutesAsTimeOfDay(totalMinutes: number) {
  if (!Number.isFinite(totalMinutes)) return "";
  const rounded = Math.round(totalMinutes);
  const dayOffset = Math.max(0, Math.floor(rounded / (24 * 60)));
  const minutesInDay = ((rounded % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(minutesInDay / 60)
    .toString()
    .padStart(2, "0");
  const m = Math.floor(minutesInDay % 60)
    .toString()
    .padStart(2, "0");
  return dayOffset > 0 ? `${h}:${m} +${dayOffset}` : `${h}:${m}`;
}

export function parseQuantifiableValueToComparable(
  habit: HabitLikeForRules,
  rawValue: string | null | undefined,
): number | null {
  if (typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  if (habit.quantUnitPreset === "time_of_day") {
    return parseTimeOfDayValueText(trimmed)?.totalMinutes ?? null;
  }

  const normalized = trimmed.replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function getQuantifiableComparableTarget(
  habit: HabitLikeForRules,
  rawTarget: string | null | undefined,
): number | null {
  const parsedTarget = parseQuantifiableValueToComparable(habit, rawTarget);
  if (parsedTarget == null) return null;

  // Special case: for time-of-day "at most 00:00", treat the target as the midnight
  // at the end of the tracked day (24:00) instead of the start (00:00).
  if (
    habit.quantUnitPreset === "time_of_day" &&
    habit.quantGoalType === "at_most" &&
    typeof rawTarget === "string" &&
    rawTarget.trim() === "00:00" &&
    parsedTarget === 0
  ) {
    return 24 * 60;
  }

  return parsedTarget;
}

export function doesQuantifiableValueMeetGoal(
  habit: HabitLikeForRules,
  rawValue: string | null | undefined,
): boolean {
  const comparableValue = parseQuantifiableValueToComparable(habit, rawValue);
  if (comparableValue == null) return false;
  const comparableTarget = getQuantifiableComparableTarget(habit, habit.quantTargetValue ?? null);
  if (comparableTarget == null) return false;
  if (habit.quantGoalType === "at_most") return comparableValue <= comparableTarget;
  return comparableValue >= comparableTarget;
}
