import { useMemo, useState, type ReactNode } from "react";
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfQuarter,
  startOfToday,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subQuarters,
  subWeeks,
  subYears,
} from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type Habit } from "@shared/routes";
import {
  doesQuantifiableValueMeetGoal,
  formatComparableMinutesAsTimeOfDay,
  getHabitFrequencyCount,
  getHabitFrequencyPeriod,
  getHabitTrackingType,
  getQuantifiableComparableTarget,
  getHabitUnitLabel,
  parseQuantifiableValueToComparable,
} from "@shared/habit-config";
import {
  addPeriodStartDate,
  computeBestPeriodStreak,
  computeCurrentPeriodStreak,
  getPeriodStartDate,
  getPeriodStartKeyFromDateKey,
} from "@shared/habit-periods";
import { hasHabitLogValue, isHabitLogDone, useHabitLogs } from "@/hooks/use-habit-logs";
import { X } from "lucide-react";

type ScoreGranularity = "day" | "week" | "month" | "quarter" | "year";
type HistoryGranularity = "week" | "month" | "quarter" | "year";
type Bucket = {
  key: string;
  label: string;
  shortLabel: string;
  start: Date;
  end: Date;
  dateKeys: string[];
};

type StreakRun = {
  start: Date;
  end: Date;
  length: number;
};

interface HabitStatsModalProps {
  habit: Habit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function buildDateKeysBetween(start: Date, end: Date) {
  const keys: string[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endKeyDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (current.getTime() <= endKeyDate.getTime()) {
    keys.push(format(current, "yyyy-MM-dd"));
    current.setDate(current.getDate() + 1);
  }
  return keys;
}

function getTargetPeriodDayCount(period: ReturnType<typeof getHabitFrequencyPeriod>, bucketStart: Date) {
  switch (period) {
    case "day":
      return 1;
    case "week":
      return 7;
    case "month": {
      const start = startOfMonth(bucketStart);
      const end = endOfMonth(bucketStart);
      return differenceInCalendarDays(end, start) + 1;
    }
    case "quarter": {
      const start = startOfQuarter(bucketStart);
      const end = endOfQuarter(bucketStart);
      return differenceInCalendarDays(end, start) + 1;
    }
    case "year": {
      const start = startOfYear(bucketStart);
      const end = endOfYear(bucketStart);
      return differenceInCalendarDays(end, start) + 1;
    }
    default:
      return 1;
  }
}

function buildBuckets(granularity: ScoreGranularity | HistoryGranularity, today = startOfToday()): Bucket[] {
  if (granularity === "day") {
    return Array.from({ length: 21 }, (_, i) => {
      const date = subDays(today, 20 - i);
      return {
        key: format(date, "yyyy-MM-dd"),
        label: format(date, "dd MMM").toUpperCase(),
        shortLabel: format(date, "dd"),
        start: date,
        end: date,
        dateKeys: [format(date, "yyyy-MM-dd")],
      };
    });
  }

  if (granularity === "week") {
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    return Array.from({ length: 16 }, (_, i) => {
      const start = subWeeks(currentWeekStart, 15 - i);
      const end = endOfWeek(start, { weekStartsOn: 1 });
      return {
        key: format(start, "yyyy-MM-dd"),
        label: `${format(start, "dd MMM").toUpperCase()} → ${format(end, "dd MMM").toUpperCase()}`,
        shortLabel: format(start, "dd MMM").toUpperCase(),
        start,
        end,
        dateKeys: buildDateKeysBetween(start, end),
      };
    });
  }

  if (granularity === "month") {
    return Array.from({ length: 12 }, (_, i) => {
      const start = startOfMonth(subMonths(today, 11 - i));
      const end = endOfMonth(start);
      return {
        key: format(start, "yyyy-MM"),
        label: format(start, "MMMM yyyy"),
        shortLabel: format(start, "MMM yy").toUpperCase(),
        start,
        end,
        dateKeys: buildDateKeysBetween(start, end),
      };
    });
  }

  if (granularity === "quarter") {
    return Array.from({ length: 8 }, (_, i) => {
      const start = startOfQuarter(subQuarters(today, 7 - i));
      const end = endOfQuarter(start);
      const q = Math.floor(start.getMonth() / 3) + 1;
      return {
        key: `${start.getFullYear()}-Q${q}`,
        label: `Q${q} ${start.getFullYear()}`,
        shortLabel: `Q${q} ${String(start.getFullYear()).slice(-2)}`,
        start,
        end,
        dateKeys: buildDateKeysBetween(start, end),
      };
    });
  }

  return Array.from({ length: 6 }, (_, i) => {
    const start = startOfYear(subYears(today, 5 - i));
    const end = endOfYear(start);
    return {
      key: format(start, "yyyy"),
      label: format(start, "yyyy"),
      shortLabel: format(start, "yyyy"),
      start,
      end,
      dateKeys: buildDateKeysBetween(start, end),
    };
  });
}

function expectedCountForBucket(habit: Habit, bucket: Bucket) {
  const targetCount = getHabitFrequencyCount(habit);
  const targetPeriod = getHabitFrequencyPeriod(habit);
  const targetDays = getTargetPeriodDayCount(targetPeriod, bucket.start);
  const bucketDays = Math.max(1, bucket.dateKeys.length);
  return (targetCount * bucketDays) / Math.max(1, targetDays);
}

function getTimeLabelFromMinutes(totalMinutes: number) {
  return formatComparableMinutesAsTimeOfDay(totalMinutes);
}

function getQuantGoalLabel(goalType: string | null | undefined, isTimeOfDay: boolean) {
  if (isTimeOfDay) {
    return goalType === "at_most" ? "Avant" : "Après";
  }
  return goalType === "at_most" ? "Au plus" : "Au moins";
}

function roundUpToStep(value: number, step: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.ceil(value / step) * step;
}

function buildTimeOfDayAxisTicks(values: Array<number | null>, targetLineValue?: number | null) {
  const numericValues = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const rawMax = Math.max(0, ...(numericValues.length ? numericValues : [0]), ...(typeof targetLineValue === "number" ? [targetLineValue] : []));
  const maxTick = rawMax >= 24 * 60 ? roundUpToStep(rawMax, 30) : roundUpToStep(Math.max(rawMax, 12 * 60), 60);

  const ticks = new Set<number>([0]);

  if (maxTick >= 12 * 60) ticks.add(12 * 60);
  if (maxTick >= 24 * 60) ticks.add(24 * 60);

  if (maxTick > 0 && !ticks.has(maxTick)) {
    ticks.add(maxTick);
  }

  if (maxTick < 12 * 60 && maxTick > 60) {
    ticks.add(roundUpToStep(maxTick / 2, 60));
  }

  return Array.from(ticks).sort((a, b) => a - b);
}

function SegmentButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pixel-button px-3 py-2 text-[9px] sm:text-[10px] ${
        active ? "bg-primary/20 border-accent text-foreground" : "bg-transparent border-primary text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function LineChart({
  values,
  labels,
  yFormatter,
  targetLineValue,
  customTickValues,
}: {
  values: Array<number | null>;
  labels: string[];
  yFormatter?: (value: number) => string;
  targetLineValue?: number | null;
  customTickValues?: number[];
}) {
  const width = 720;
  const height = 220;
  const padding = 24;
  const numericValues = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const minValue = numericValues.length ? Math.min(...numericValues, ...(typeof targetLineValue === "number" ? [targetLineValue] : [])) : 0;
  const maxValue = numericValues.length ? Math.max(...numericValues, ...(typeof targetLineValue === "number" ? [targetLineValue] : [])) : 100;
  const customTickMin = customTickValues?.length ? Math.min(...customTickValues) : null;
  const customTickMax = customTickValues?.length ? Math.max(...customTickValues) : null;
  const yMin = Math.min(0, minValue);
  const yMax = Math.max(maxValue, customTickMax ?? Number.NEGATIVE_INFINITY, yMin + 1);
  const effectiveYMin = Math.min(yMin, customTickMin ?? Number.POSITIVE_INFINITY);
  const range = Math.max(1, yMax - effectiveYMin);
  const xStep = values.length <= 1 ? width - padding * 2 : (width - padding * 2) / (values.length - 1);

  const points = values
    .map((value, index) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      const x = padding + index * xStep;
      const y = height - padding - ((value - effectiveYMin) / range) * (height - padding * 2);
      return { x, y, value, index };
    })
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const targetLineY =
    typeof targetLineValue === "number"
      ? height - padding - ((targetLineValue - effectiveYMin) / range) * (height - padding * 2)
      : null;

  const tickValues = customTickValues?.length ? customTickValues : [0, 0.5, 1].map((ratio) => effectiveYMin + (yMax - effectiveYMin) * ratio);

  return (
    <div className="border-2 border-border/60 bg-background/10 p-3">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[620px] h-[220px]">
          <rect x={0} y={0} width={width} height={height} fill="transparent" />
          {tickValues.map((tick, idx) => {
            const y = height - padding - ((tick - effectiveYMin) / range) * (height - padding * 2);
            return (
              <g key={`tick-${idx}`}>
                <line x1={padding} x2={width - padding} y1={y} y2={y} stroke="hsl(var(--border) / 0.35)" strokeDasharray="3 3" />
                <text x={padding - 6} y={y + 3} textAnchor="end" className="fill-white/70 text-[10px] font-body">
                  {yFormatter ? yFormatter(tick) : Math.round(tick)}
                </text>
              </g>
            );
          })}

          {targetLineY != null && (
            <line
              x1={padding}
              x2={width - padding}
              y1={targetLineY}
              y2={targetLineY}
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              strokeDasharray="5 4"
              opacity={0.9}
            />
          )}

          <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} stroke="hsl(var(--border) / 0.7)" />
          <line x1={padding} x2={padding} y1={padding} y2={height - padding} stroke="hsl(var(--border) / 0.7)" />

          {polylinePoints.length > 0 && (
            <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth={3} points={polylinePoints} />
          )}

          {points.map((p) => (
            <g key={`point-${p.index}`}>
              <circle cx={p.x} cy={p.y} r={4} fill="hsl(var(--primary))" />
              <title>{`${labels[p.index]}: ${yFormatter ? yFormatter(p.value) : Math.round(p.value)}`}</title>
            </g>
          ))}

          {labels.map((label, index) => {
            if (index % Math.ceil(labels.length / 8) !== 0 && index !== labels.length - 1) return null;
            const x = padding + index * xStep;
            return (
              <text key={`xlabel-${index}`} x={x} y={height - 6} textAnchor="middle" className="fill-white/70 text-[9px] font-display">
                {label}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function BarChart({
  values,
  labels,
  valueFormatter,
}: {
  values: number[];
  labels: string[];
  valueFormatter?: (value: number) => string;
}) {
  const maxValue = Math.max(1, ...values, 1);
  return (
    <div className="border-2 border-border/60 bg-background/10 p-3">
      <div className="overflow-x-auto">
        <div className="min-w-[620px] h-[220px] flex items-end gap-2 px-2">
          {values.map((value, index) => {
            const heightPercent = (value / maxValue) * 100;
            return (
              <div key={`bar-${labels[index]}-${index}`} className="flex-1 min-w-[28px] flex flex-col justify-end items-center gap-2">
                <div className="text-[9px] text-white/70 font-body whitespace-nowrap">
                  {valueFormatter ? valueFormatter(value) : Math.round(value)}
                </div>
                <div
                  className="w-full border-2 border-border/50 bg-primary/25"
                  style={{ height: `${Math.max(4, heightPercent)}%` }}
                  title={`${labels[index]}: ${valueFormatter ? valueFormatter(value) : value}`}
                />
                <div className="text-[8px] text-white/70 font-display text-center leading-none whitespace-nowrap">
                  {labels[index]}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function buildStreakRuns(habit: Habit, validatedDateKeys: string[]) {
  const period = getHabitFrequencyPeriod(habit);
  const targetCount = getHabitFrequencyCount(habit);
  const byPeriod = new Map<string, number>();

  for (const key of new Set(validatedDateKeys)) {
    const periodKey = getPeriodStartKeyFromDateKey(key, period);
    if (!periodKey) continue;
    byPeriod.set(periodKey, (byPeriod.get(periodKey) ?? 0) + 1);
  }

  const completedPeriodKeys = Array.from(byPeriod.entries())
    .filter(([, count]) => count >= targetCount)
    .map(([key]) => key)
    .sort();

  const runs: StreakRun[] = [];
  let currentRun: { start: Date; end: Date; length: number } | null = null;
  let previousPeriodStart: Date | null = null;

  for (const periodKey of completedPeriodKeys) {
    const periodStart = new Date(`${periodKey}T00:00:00`);
    if (Number.isNaN(periodStart.getTime())) continue;

    if (currentRun && previousPeriodStart) {
      const expectedNext = addPeriodStartDate(previousPeriodStart, period, 1);
      if (format(expectedNext, "yyyy-MM-dd") === periodKey) {
        currentRun.end = periodStart;
        currentRun.length += 1;
      } else {
        runs.push(currentRun);
        currentRun = { start: periodStart, end: periodStart, length: 1 };
      }
    } else {
      currentRun = { start: periodStart, end: periodStart, length: 1 };
    }

    previousPeriodStart = periodStart;
  }

  if (currentRun) runs.push(currentRun);

  return runs.sort((a, b) => b.end.getTime() - a.end.getTime());
}

function getPeriodEndDateForDisplay(periodStart: Date, period: ReturnType<typeof getHabitFrequencyPeriod>) {
  switch (period) {
    case "day":
      return periodStart;
    case "week":
      return endOfWeek(periodStart, { weekStartsOn: 1 });
    case "month":
      return endOfMonth(periodStart);
    case "quarter":
      return endOfQuarter(periodStart);
    case "year":
      return endOfYear(periodStart);
    default:
      return periodStart;
  }
}

function getPeriodColorState(habit: Habit, log: any) {
  if (!log) return "empty" as const;
  if (isHabitLogDone(log)) return "done" as const;
  if (getHabitTrackingType(habit) === "quantifiable" && hasHabitLogValue(log)) return "partial" as const;
  return "empty" as const;
}

export function HabitStatsModal({ habit, open, onOpenChange }: HabitStatsModalProps) {
  const [scoreGranularity, setScoreGranularity] = useState<ScoreGranularity>("week");
  const [historyGranularity, setHistoryGranularity] = useState<HistoryGranularity>("month");
  const { data: logs = [], isLoading } = useHabitLogs(habit?.id ?? 0);

  const analytics = useMemo(() => {
    if (!habit) return null;

    const trackingType = getHabitTrackingType(habit);
    const validatedLogs = logs.filter((log) => isHabitLogDone(log));
    const validatedDateKeys = validatedLogs.map((log) => log.date);
    const validatedDateSet = new Set(validatedDateKeys);
    const logsByDate = new Map(logs.map((log) => [log.date, log]));
    const quantValuesByDate = new Map<string, number>();

    for (const log of logs) {
      const comparable = parseQuantifiableValueToComparable(habit, log.valueText ?? null);
      if (comparable != null) {
        quantValuesByDate.set(log.date, comparable);
      }
    }

    const scoreBuckets = buildBuckets(scoreGranularity);
    const scoreLineValues = scoreBuckets.map((bucket) => {
      if (trackingType === "quantifiable" && (habit as Habit & { quantUnitPreset?: string | null }).quantUnitPreset === "time_of_day") {
        const bucketValues = bucket.dateKeys
          .map((dateKey) => quantValuesByDate.get(dateKey))
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
        if (bucketValues.length === 0) return null;
        return bucketValues.reduce((sum, value) => sum + value, 0) / bucketValues.length;
      }

      const completedCount = bucket.dateKeys.reduce((count, dateKey) => count + (validatedDateSet.has(dateKey) ? 1 : 0), 0);
      const expected = expectedCountForBucket(habit, bucket);
      if (expected <= 0) return 0;
      return (completedCount / expected) * 100;
    });

    const historyBuckets = buildBuckets(historyGranularity);
    const historyBarValues = historyBuckets.map((bucket) => {
      if (trackingType === "quantifiable") {
        return bucket.dateKeys.reduce((sum, dateKey) => sum + (quantValuesByDate.get(dateKey) ?? 0), 0);
      }
      return bucket.dateKeys.reduce((count, dateKey) => count + (validatedDateSet.has(dateKey) ? 1 : 0), 0);
    });

    const fixedPeriodBuckets: Array<{ key: string; label: string; bucket: Bucket }> = [
      { key: "today", label: "Aujourd'hui", bucket: buildBuckets("day", startOfToday()).slice(-1)[0]! },
      { key: "week", label: "Semaine", bucket: buildBuckets("week", startOfToday()).slice(-1)[0]! },
      { key: "month", label: "Mois", bucket: buildBuckets("month", startOfToday()).slice(-1)[0]! },
      { key: "quarter", label: "Trimestre", bucket: buildBuckets("quarter", startOfToday()).slice(-1)[0]! },
      { key: "year", label: "Année", bucket: buildBuckets("year", startOfToday()).slice(-1)[0]! },
    ];

    const targetRows = fixedPeriodBuckets.map(({ key, label, bucket }) => {
      const completedCount = bucket.dateKeys.reduce((count, dateKey) => count + (validatedDateSet.has(dateKey) ? 1 : 0), 0);
      const expected = expectedCountForBucket(habit, bucket);
      const ratio = expected > 0 ? completedCount / expected : 0;
      return { key, label, completedCount, expected, ratio, percent: ratio * 100 };
    });

    const streakRuns = buildStreakRuns(habit, validatedDateKeys);
    const streakPeriod = getHabitFrequencyPeriod(habit);
    const streakCurrent = computeCurrentPeriodStreak(validatedDateKeys, streakPeriod, getHabitFrequencyCount(habit));
    const streakBest = computeBestPeriodStreak(validatedDateKeys, streakPeriod, getHabitFrequencyCount(habit));

    const earliestRelevantDate = (() => {
      const fromLog = logs.map((log) => new Date(`${log.date}T00:00:00`)).filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => a.getTime() - b.getTime())[0];
      if (fromLog) return fromLog;
      const created = new Date((habit.createdAt as unknown as string) ?? new Date().toISOString());
      return Number.isNaN(created.getTime()) ? startOfToday() : created;
    })();

    const monthGrids = [] as Array<{ monthStart: Date; dayCells: Array<{ dateKey: string; dayNumber: number; state: "empty" | "partial" | "done" }> }>;
    let cursorMonth = startOfMonth(earliestRelevantDate);
    const currentMonth = startOfMonth(startOfToday());
    while (cursorMonth.getTime() <= currentMonth.getTime()) {
      const monthStart = new Date(cursorMonth);
      const monthEnd = endOfMonth(monthStart);
      const dayCells = buildDateKeysBetween(monthStart, monthEnd).map((dateKey) => {
        const log = logsByDate.get(dateKey);
        return {
          dateKey,
          dayNumber: Number(dateKey.slice(-2)),
          state: getPeriodColorState(habit, log),
        };
      });
      monthGrids.push({ monthStart, dayCells });
      cursorMonth = startOfMonth(addDays(monthEnd, 1));
    }

    return {
      trackingType,
      validatedDateSet,
      logsByDate,
      quantValuesByDate,
      scoreBuckets,
      scoreLineValues,
      historyBuckets,
      historyBarValues,
      targetRows,
      streakRuns,
      streakCurrent,
      streakBest,
      streakPeriod,
      monthGrids: monthGrids.reverse(), // recent first
    };
  }, [habit, logs, scoreGranularity, historyGranularity]);

  if (!habit) return null;

  const isQuantifiable = analytics?.trackingType === "quantifiable";
  const isTimeOfDay = (habit as Habit & { quantUnitPreset?: string | null }).quantUnitPreset === "time_of_day";
  const timeTarget = isTimeOfDay
    ? getQuantifiableComparableTarget(habit, (habit as Habit & { quantTargetValue?: string | null }).quantTargetValue ?? null)
    : null;
  const quantGoalType = (habit as Habit & { quantGoalType?: string | null }).quantGoalType ?? "at_least";
  const quantTargetValue = (habit as Habit & { quantTargetValue?: string | null }).quantTargetValue ?? "-";
  const streakUnitLabel =
    analytics?.streakPeriod === "day"
      ? "jours"
      : analytics?.streakPeriod === "week"
        ? "semaines"
        : analytics?.streakPeriod === "month"
          ? "mois"
          : analytics?.streakPeriod === "quarter"
            ? "trimestres"
            : "années";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] max-w-[1200px] h-[calc(100dvh-5rem)] max-h-[calc(100dvh-5rem)] sm:h-[calc(100dvh-7rem)] sm:max-h-[calc(100dvh-7rem)] !top-6 sm:!top-8 !translate-y-0 p-0 border-4 border-border rounded-none bg-card overflow-hidden !flex !flex-col [&>button]:hidden"
        style={{ boxShadow: "8px 8px 0px 0px hsl(var(--border-shadow))" }}
      >
        <div className="h-full min-h-0 flex flex-col">
          <div className="border-b-4 border-border bg-primary/10 px-5 py-4">
            <DialogHeader className="pr-12">
              <DialogTitle className="font-display text-xl sm:text-2xl text-foreground">{habit.title} · Habit Stats</DialogTitle>
              <DialogDescription className="font-body text-lg text-muted-foreground">
                {habit.description || "Detailed performance view for this habit."}
              </DialogDescription>
            </DialogHeader>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="absolute right-3 top-3 w-10 h-10 border-2 border-border/60 bg-card/40 hover:bg-card/70 flex items-center justify-center"
              aria-label="Close habit stats"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-5">
            <div className="pixel-box p-4 bg-card/30 border-border/70">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="border-2 border-border/60 bg-background/10 px-3 py-2">
                  <p className="font-display text-[9px] text-white/70">Type</p>
                  <p className="font-body text-xl text-white">{isQuantifiable ? "Quantifiable" : "Yes / No"}</p>
                </div>
                <div className="border-2 border-border/60 bg-background/10 px-3 py-2">
                  <p className="font-display text-[9px] text-white/70">Goal Frequency</p>
                  <p className="font-body text-xl text-white">{getHabitFrequencyCount(habit)} / {getHabitFrequencyPeriod(habit)}</p>
                </div>
                <div className="border-2 border-border/60 bg-background/10 px-3 py-2">
                  <p className="font-display text-[9px] text-white/70">Current Streak</p>
                  <p className="font-body text-xl text-white">{analytics?.streakCurrent ?? 0} {streakUnitLabel}</p>
                </div>
                <div className="border-2 border-border/60 bg-background/10 px-3 py-2">
                  <p className="font-display text-[9px] text-white/70">Best Streak</p>
                  <p className="font-body text-xl text-white">{analytics?.streakBest ?? 0} {streakUnitLabel}</p>
                </div>
              </div>
            </div>

            {isQuantifiable && analytics && (
              <div className="pixel-box p-4 bg-card/30 border-border/70 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-sm text-white">Cible</h3>
                  <p className="font-body text-lg text-white/70">
                    {isTimeOfDay ? "Objectif : " : ""}
                    {getQuantGoalLabel(quantGoalType, isTimeOfDay)} {quantTargetValue}
                    {isTimeOfDay ? " (HH:mm)" : ` ${getHabitUnitLabel(habit)}`}
                  </p>
                </div>
                <div className="space-y-2">
                  {analytics.targetRows.map((row) => (
                    <div key={row.key} className="grid grid-cols-[110px_minmax(0,1fr)_84px] items-center gap-3">
                      <span className="font-display text-[10px] text-white/80">{row.label}</span>
                      <div className="h-4 border-2 border-border/60 bg-background/10 overflow-hidden">
                        <div
                          className="h-full bg-primary/40 border-r-2 border-primary/70"
                          style={{ width: `${Math.max(0, Math.min(100, row.percent))}%` }}
                        />
                      </div>
                      <span className="font-body text-lg text-white text-right">{Math.round(row.percent)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pixel-box p-4 bg-card/30 border-border/70 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-sm text-white">Score</h3>
                <div className="flex flex-wrap gap-2">
                  {(["day", "week", "month", "quarter", "year"] as const).map((granularity) => (
                    <SegmentButton key={granularity} active={scoreGranularity === granularity} onClick={() => setScoreGranularity(granularity)}>
                      {granularity === "day" ? "Day" : granularity === "week" ? "Week" : granularity === "month" ? "Month" : granularity === "quarter" ? "Quarter" : "Year"}
                    </SegmentButton>
                  ))}
                </div>
              </div>

              {isLoading || !analytics ? (
                <p className="font-body text-lg text-white/70">Loading...</p>
              ) : (
                <LineChart
                  values={analytics.scoreLineValues}
                  labels={analytics.scoreBuckets.map((bucket) => bucket.shortLabel)}
                  yFormatter={
                    isQuantifiable && isTimeOfDay
                      ? (value) => getTimeLabelFromMinutes(value)
                      : (value) => `${Math.round(value)}%`
                  }
                  targetLineValue={isQuantifiable && isTimeOfDay ? timeTarget : null}
                  customTickValues={
                    isQuantifiable && isTimeOfDay
                      ? buildTimeOfDayAxisTicks(analytics.scoreLineValues, timeTarget)
                      : undefined
                  }
                />
              )}
            </div>

            <div className="pixel-box p-4 bg-card/30 border-border/70 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-sm text-white">Historique</h3>
                <div className="flex flex-wrap gap-2">
                  {(["week", "month", "quarter", "year"] as const).map((granularity) => (
                    <SegmentButton key={granularity} active={historyGranularity === granularity} onClick={() => setHistoryGranularity(granularity)}>
                      {granularity === "week" ? "Week" : granularity === "month" ? "Month" : granularity === "quarter" ? "Quarter" : "Year"}
                    </SegmentButton>
                  ))}
                </div>
              </div>
              {isLoading || !analytics ? (
                <p className="font-body text-lg text-white/70">Loading...</p>
              ) : (
                <BarChart
                  values={analytics.historyBarValues}
                  labels={analytics.historyBuckets.map((bucket) => bucket.shortLabel)}
                  valueFormatter={
                    isQuantifiable && isTimeOfDay
                      ? (value) => getTimeLabelFromMinutes(value)
                      : isQuantifiable
                        ? (value) => `${Math.round(value * 100) / 100}`
                        : undefined
                  }
                />
              )}
            </div>

            <div className="pixel-box p-4 bg-card/30 border-border/70 space-y-3">
              <h3 className="font-display text-sm text-white">Calendrier</h3>
              <div className="overflow-x-auto">
                <div className="flex gap-4 w-max pr-2">
                  {(analytics?.monthGrids ?? []).map(({ monthStart, dayCells }) => {
                    const leadingOffset = ((monthStart.getDay() + 6) % 7);
                    const cells = [
                      ...Array.from({ length: leadingOffset }).map((_, i) => ({ kind: "empty" as const, key: `pad-${i}` })),
                      ...dayCells.map((day) => ({ kind: "day" as const, day })),
                    ];
                    return (
                      <div key={format(monthStart, "yyyy-MM")} className="border-2 border-border/60 bg-background/10 p-3 w-[220px] shrink-0">
                        <p className="font-display text-[10px] text-white mb-2">{format(monthStart, "MMMM yyyy")}</p>
                        <div className="grid grid-cols-7 gap-1 mb-2 text-center">
                          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                            <span key={d} className="font-display text-[8px] text-white/60">{d}</span>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {cells.map((cell, idx) => {
                            if (cell.kind === "empty") {
                              return <div key={`${format(monthStart, "yyyy-MM")}-pad-${idx}`} className="w-7 h-7" />;
                            }
                            const state = cell.day.state;
                            return (
                              <div
                                key={cell.day.dateKey}
                                className={`w-7 h-7 border text-[9px] font-display flex items-center justify-center ${
                                  state === "done"
                                    ? "bg-primary/35 border-primary/70 text-white"
                                    : state === "partial"
                                      ? "bg-primary/15 border-primary/40 text-white/90"
                                      : "bg-background/5 border-border/25 text-white/70"
                                }`}
                                title={cell.day.dateKey}
                              >
                                {cell.day.dayNumber}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pixel-box p-4 bg-card/30 border-border/70 space-y-3">
              <h3 className="font-display text-sm text-white">Meilleures séries</h3>
              {(analytics?.streakRuns.length ?? 0) === 0 ? (
                <p className="font-body text-lg text-white/70">No streak yet.</p>
              ) : (
                <div className="space-y-2">
                  {analytics!.streakRuns.slice(0, 12).map((run, idx) => {
                    const period = analytics!.streakPeriod;
                    const start = run.start;
                    const end = getPeriodEndDateForDisplay(run.end, period);
                    const widthPercent = Math.min(100, 15 + run.length * 8);
                    return (
                      <div key={`${run.start.toISOString()}-${idx}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                        <span className="font-body text-lg text-white/80 whitespace-nowrap">{format(start, "dd MMM yyyy")}</span>
                        <div className="h-7 border-2 border-border/60 bg-background/10 relative overflow-hidden flex items-center">
                          <div className="absolute inset-y-0 left-0 bg-primary/30 border-r-2 border-primary/60" style={{ width: `${widthPercent}%` }} />
                          <span className="relative z-10 px-2 font-display text-[10px] text-white">
                            {run.length} {streakUnitLabel}
                          </span>
                        </div>
                        <span className="font-body text-lg text-white/80 whitespace-nowrap">{format(end, "dd MMM yyyy")}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
