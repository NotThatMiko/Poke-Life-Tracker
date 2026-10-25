import type { HabitFrequencyPeriod } from "./habit-config";

function parseDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfLocalWeekMonday(date: Date) {
  const day = date.getDay(); // 0=Sun ... 6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + diffToMonday);
}

export function getPeriodStartDate(date: Date, period: HabitFrequencyPeriod) {
  const d = startOfLocalDay(date);
  switch (period) {
    case "day":
      return d;
    case "week":
      return startOfLocalWeekMonday(d);
    case "month":
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case "quarter":
      return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
    case "year":
      return new Date(d.getFullYear(), 0, 1);
    default:
      return d;
  }
}

export function getPeriodStartKeyFromDateKey(dateKey: string, period: HabitFrequencyPeriod) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  return formatDateKey(getPeriodStartDate(parsed, period));
}

export function addPeriodStartDate(start: Date, period: HabitFrequencyPeriod, amount = 1) {
  switch (period) {
    case "day":
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + amount);
    case "week":
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * amount);
    case "month":
      return new Date(start.getFullYear(), start.getMonth() + amount, 1);
    case "quarter":
      return new Date(start.getFullYear(), start.getMonth() + amount * 3, 1);
    case "year":
      return new Date(start.getFullYear() + amount, 0, 1);
    default:
      return new Date(start);
  }
}

export function countCompletedPeriodsForDates(
  dateKeys: string[],
  period: HabitFrequencyPeriod,
  targetCount: number,
) {
  const required = Math.max(1, Math.floor(targetCount));
  const hitsByPeriod = new Map<string, number>();
  const uniqueDates = new Set(dateKeys);

  for (const dateKey of uniqueDates) {
    const periodKey = getPeriodStartKeyFromDateKey(dateKey, period);
    if (!periodKey) continue;
    hitsByPeriod.set(periodKey, (hitsByPeriod.get(periodKey) ?? 0) + 1);
  }

  let completedPeriods = 0;
  for (const hits of hitsByPeriod.values()) {
    if (hits >= required) completedPeriods += 1;
  }

  return completedPeriods;
}

function computePeriodStreakSummaryInternal(
  dateKeys: string[],
  period: HabitFrequencyPeriod,
  targetCount: number,
  now = new Date(),
) {
  const required = Math.max(1, Math.floor(targetCount));
  const uniqueDates = Array.from(new Set(dateKeys)).sort();
  if (uniqueDates.length === 0) return { bestStreak: 0, currentStreak: 0 };

  const hitsByPeriod = new Map<string, number>();
  for (const dateKey of uniqueDates) {
    const periodKey = getPeriodStartKeyFromDateKey(dateKey, period);
    if (!periodKey) continue;
    hitsByPeriod.set(periodKey, (hitsByPeriod.get(periodKey) ?? 0) + 1);
  }

  if (hitsByPeriod.size === 0) return { bestStreak: 0, currentStreak: 0 };

  const sortedPeriodKeys = Array.from(hitsByPeriod.keys()).sort();
  const firstPeriodKey = sortedPeriodKeys[0];
  const firstPeriodDate = firstPeriodKey ? parseDateKey(firstPeriodKey) : null;
  if (!firstPeriodDate) return { bestStreak: 0, currentStreak: 0 };

  const currentPeriodStart = getPeriodStartDate(now, period);
  const currentPeriodKey = formatDateKey(currentPeriodStart);
  let cursor = new Date(firstPeriodDate);
  let run = 0;
  let best = 0;

  while (cursor.getTime() <= currentPeriodStart.getTime()) {
    const periodKey = formatDateKey(cursor);
    const hits = hitsByPeriod.get(periodKey) ?? 0;
    const isCurrentPeriod = periodKey === currentPeriodKey;

    if (hits >= required) {
      run += 1;
      if (run > best) best = run;
    } else if (!isCurrentPeriod) {
      run = 0;
    }
    // Current incomplete period below target is neutral: it doesn't increment and doesn't break.

    cursor = addPeriodStartDate(cursor, period, 1);
  }

  return { bestStreak: best, currentStreak: run };
}

export function computeBestPeriodStreak(
  dateKeys: string[],
  period: HabitFrequencyPeriod,
  targetCount: number,
  now = new Date(),
) {
  return computePeriodStreakSummaryInternal(dateKeys, period, targetCount, now).bestStreak;
}

export function computeCurrentPeriodStreak(
  dateKeys: string[],
  period: HabitFrequencyPeriod,
  targetCount: number,
  now = new Date(),
) {
  return computePeriodStreakSummaryInternal(dateKeys, period, targetCount, now).currentStreak;
}
