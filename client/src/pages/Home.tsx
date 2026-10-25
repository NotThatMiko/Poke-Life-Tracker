import { type ComponentType, lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  addDays,
  differenceInCalendarDays,
  format,
  startOfDay,
  startOfMonth,
  startOfToday,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import { useHabits, useReorderHabits } from "@/hooks/use-habits";
import {
  getHabitLogStatus,
  hasHabitLogValue,
  isHabitLogDone,
  useHabitLogs,
  useToggleHabitLog,
} from "@/hooks/use-habit-logs";
import { HabitRow } from "@/components/habit-row";
import { HabitForm } from "@/components/habit-form";
import { QuantifiableLogModal } from "@/components/quantifiable-log-modal";
import type { Habit } from "@shared/routes";
import { getHabitTrackingType } from "@shared/habit-config";
import { computeBestPeriodStreak, computeCurrentPeriodStreak } from "@shared/habit-periods";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  Cog,
  Settings2,
} from "lucide-react";
import cloudsBackgroundImg from "@assets/Clouds Background.png";
import noHabitsKarpImg from "@assets/No_habits_Karp.png";
import mewGif from "@assets/mew.gif";
import mewShinyGif from "@assets/mew_shiny.gif";
import moonImg from "@assets/moon.webp";
import skipMoonImg from "@assets/moon.png";
import starsGif from "@assets/stars.gif";
import starOkImg from "@assets/star_ok.png";
import starNotOkImg from "@assets/star_notok.png";
import pokeballImg from "@assets/pokeball.png";
import fireworksGif from "@assets/fireworks.gif";
import runningPikachuRightGif from "@assets/running pikachu right.gif";

const LazyHabitStatsModal = lazy(() =>
  import("@/components/habit-stats-modal").then((module) => ({ default: module.HabitStatsModal })),
);
const LazyPokegamePage = lazy(() =>
  import("@/components/pokegame-page").then((module) => ({ default: module.PokegamePage })),
);
const LazyTrackerSettingsModal = lazy(() =>
  import("@/components/tracker-settings-modal").then((module) => ({ default: module.TrackerSettingsModal })),
);

// Number of days to display in the grid
const DAYS_TO_SHOW = 7;
type HomeViewMode = "weekly" | "today" | "stats";
type StatsGranularity = "day" | "week" | "month";
type StatsBucket = {
  key: string;
  label: string;
  dateKeys: string[];
};
type StatsMetricKey = "last7" | "last30" | "currentStreak" | "bestStreak" | "rate";
type StatsMetricVisibility = Record<StatsMetricKey, boolean>;
type TrackerSettingsSection = "account" | "import-export";
type PikachuRunner = {
  id: number;
  top: string;
  delayMs: number;
  durationMs: number;
  scale: number;
};
type FireworkBurst = {
  id: number;
  top: string;
  left: string;
  delayMs: number;
  durationMs: number;
  scale: number;
  opacity: number;
};
type PikachuSprint = {
  id: number;
  totalDurationMs: number;
  runners: PikachuRunner[];
  fireworks: FireworkBurst[];
};

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return null;

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  if ([r, g, b].some(Number.isNaN)) return null;
  return { r, g, b };
}

function rgbaFromHex(hex: string, alpha: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(255, 255, 255, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function mixHexWithBlack(hex: string, amount = 0.9) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const mix = (channel: number) =>
    Math.round(channel * (1 - amount))
      .toString(16)
      .padStart(2, "0");

  return `#${mix(rgb.r)}${mix(rgb.g)}${mix(rgb.b)}`;
}

function getHabitCellBackground(habitColor: string) {
  return rgbaFromHex(mixHexWithBlack(habitColor, 0.9), 0.28);
}

function buildStatsBuckets(granularity: StatsGranularity, today: Date): StatsBucket[] {
  if (granularity === "day") {
    return Array.from({ length: 14 }, (_, index) => {
      const date = subDays(today, 13 - index);
      const key = format(date, "yyyy-MM-dd");
      return {
        key,
        label: format(date, "d MMM").toUpperCase(),
        dateKeys: [key],
      };
    });
  }

  if (granularity === "week") {
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    return Array.from({ length: 8 }, (_, index) => {
      const weekStart = subDays(currentWeekStart, (7 - index) * 7);
      const dateKeys = Array.from({ length: 7 }, (_, dayOffset) =>
        format(addDays(weekStart, dayOffset), "yyyy-MM-dd"),
      );

      return {
        key: format(weekStart, "yyyy-MM-dd"),
        label: format(weekStart, "d MMM").toUpperCase(),
        dateKeys,
      };
    });
  }

  return Array.from({ length: 6 }, (_, index) => {
    const monthDate = subMonths(today, 5 - index);
    const monthStart = startOfMonth(monthDate);
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const dateKeys = Array.from({ length: daysInMonth }, (_, dayIndex) =>
      format(new Date(year, month, dayIndex + 1), "yyyy-MM-dd"),
    );

    return {
      key: format(monthStart, "yyyy-MM"),
      label: format(monthStart, "MMM"),
      dateKeys,
    };
  });
}

function HabitTodoCheckCell({
  habitColor,
  status,
  displayValue,
  disabled,
  onClick,
}: {
  habitColor: string;
  status: "clear" | "done" | "skipped" | "recorded";
  displayValue?: string | null;
  disabled?: boolean;
  onClick: () => void;
}) {
  const isCompleted = status === "done";
  const isSkipped = status === "skipped";
  const isRecorded = status === "recorded";
  const showsValue = Boolean(displayValue);
  const emptyCellBg = getHabitCellBackground(habitColor);
  const weeklyLikeCellBorderColor = "hsl(var(--border-shadow) / 0.9)";
  const weeklyLikeCellShadowColor = "hsl(262 32% 13% / 0.62)";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        group/cell w-9 h-9 sm:w-10 sm:h-10 border-4 border-border flex items-center justify-center shrink-0
        transition-all duration-200 focus:outline-none
        ${isCompleted ? "shadow-[inset_0px_-4px_0px_rgba(0,0,0,0.08)]" : "hover:brightness-90"}
      `}
      style={{
        borderColor: weeklyLikeCellBorderColor,
        boxShadow: isCompleted
          ? `inset 0px -3px 0px 0px ${habitColor}40, 2px 2px 0px 0px ${weeklyLikeCellShadowColor}`
          : `2px 2px 0px 0px ${weeklyLikeCellShadowColor}`,
        backgroundColor: emptyCellBg,
      }}
      title={isCompleted ? "Mark as not done" : "Mark as done"}
    >
      {showsValue ? (
        <span className={`font-display text-[10px] sm:text-[11px] leading-none ${isRecorded ? "text-muted-foreground" : "text-foreground"}`}>
          {(displayValue ?? "").slice(0, 5)}
        </span>
      ) : isCompleted ? (
        <div className="animate-pop">
          <img
            src={starOkImg}
            alt=""
            aria-hidden="true"
            className="w-6 h-6 sm:w-7 sm:h-7 object-contain relative -top-px sm:-top-0.5"
          />
        </div>
      ) : isSkipped ? (
        <div className="animate-pop">
          <img
            src={skipMoonImg}
            alt=""
            aria-hidden="true"
            className="w-5 h-5 sm:w-6 sm:h-6 object-contain"
          />
        </div>
      ) : (
        <div className="opacity-0 transition-opacity duration-150 group-hover/cell:opacity-100">
          <img
            src={starNotOkImg}
            alt=""
            aria-hidden="true"
            className="w-6 h-6 sm:w-7 sm:h-7 object-contain relative top-px"
          />
        </div>
      )}
    </button>
  );
}

function ViewModeMenu({
  activeView,
  onChange,
  showViewTools,
  onToggleViewTools,
  onCreateHabit,
  isCurrentWeeklyPeriod = true,
  onPreviousWeek,
  onNextWeek,
  onResetWeek,
  canGoNextWeek = false,
}: {
  activeView: HomeViewMode;
  onChange: (view: HomeViewMode) => void;
  showViewTools: boolean;
  onToggleViewTools: () => void;
  onCreateHabit?: () => void;
  isCurrentWeeklyPeriod?: boolean;
  onPreviousWeek?: () => void;
  onNextWeek?: () => void;
  onResetWeek?: () => void;
  canGoNextWeek?: boolean;
}) {
  const items: Array<{ key: HomeViewMode; label: string; icon: ComponentType<{ className?: string }> }> = [
    { key: "today", label: "To-Do", icon: CheckSquare },
    { key: "weekly", label: "Weekly", icon: CalendarDays },
    { key: "stats", label: "Stats", icon: BarChart3 },
  ];
  const menuButtonBase =
    "pixel-button !bg-card/80 backdrop-blur-sm border-border/80";

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap sm:items-center sm:justify-between">
      <div className="min-w-0 flex flex-wrap items-center justify-start gap-2">
        {items.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`${menuButtonBase} px-3 py-2 sm:px-4 sm:py-3 flex items-center gap-2 ${
              activeView === key ? "border-accent text-foreground !bg-card/85" : "text-muted-foreground"
            }`}
            aria-pressed={activeView === key}
          >
            <Icon className="w-4 h-4" />
            <span className="text-[9px] sm:text-[10px] md:text-xs">{label}</span>
          </button>
        ))}
      </div>

      {activeView === "weekly" && onPreviousWeek && onNextWeek && (
        <div className="order-3 basis-full flex items-center justify-end gap-2 sm:hidden">
          <div className="flex items-center gap-2">
            {!isCurrentWeeklyPeriod && onResetWeek && (
              <button
                type="button"
                onClick={onResetWeek}
                className={`${menuButtonBase} px-3 py-3 flex items-center justify-center text-muted-foreground`}
                title="Back to current week"
                aria-label="Back to current week"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onPreviousWeek}
              className={`${menuButtonBase} px-3 py-3 flex items-center justify-center text-muted-foreground`}
              title="Previous week"
              aria-label="Previous week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onNextWeek}
              disabled={!canGoNextWeek}
              className={`${menuButtonBase} px-3 py-3 flex items-center justify-center text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed`}
              title="Next week"
              aria-label="Next week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="order-2 shrink-0 flex items-center justify-end gap-2 sm:order-3">
        {activeView === "weekly" && onPreviousWeek && onNextWeek && (
          <div className="hidden sm:flex items-center gap-2">
            {!isCurrentWeeklyPeriod && onResetWeek && (
              <button
                type="button"
                onClick={onResetWeek}
                className={`${menuButtonBase} px-3 py-3 flex items-center justify-center text-muted-foreground`}
                title="Back to current week"
                aria-label="Back to current week"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onPreviousWeek}
              className={`${menuButtonBase} px-3 py-3 flex items-center justify-center text-muted-foreground`}
              title="Previous week"
              aria-label="Previous week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onNextWeek}
              disabled={!canGoNextWeek}
              className={`${menuButtonBase} px-3 py-3 flex items-center justify-center text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed`}
              title="Next week"
              aria-label="Next week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleViewTools}
          className={`${menuButtonBase} px-4 py-3 flex items-center justify-center ${
            showViewTools ? "border-accent text-foreground !bg-card/85" : "text-muted-foreground"
          }`}
          title={showViewTools ? "Hide view tools" : "Show view tools"}
          aria-label={showViewTools ? "Hide view tools" : "Show view tools"}
          aria-pressed={showViewTools}
        >
          <Pencil className="w-5 h-5" />
        </button>
        {onCreateHabit && (
          <button
            type="button"
            onClick={onCreateHabit}
            className={`sm:hidden ${menuButtonBase} px-4 py-3 flex items-center justify-center text-muted-foreground`}
            title="New mission"
            aria-label="Create new mission"
          >
            <Plus className="w-5 h-5 stroke-[3]" />
          </button>
        )}
      </div>
    </div>
  );
}

function TodayTodoHabitRow({
  habit,
  todayDate,
  showActions,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  isReordering,
}: {
  habit: Habit;
  todayDate: string;
  showActions: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isReordering: boolean;
}) {
  const { data: logs = [] } = useHabitLogs(habit.id);
  const toggleMutation = useToggleHabitLog(habit.id);
  const [isEditing, setIsEditing] = useState(false);
  const [quantModalOpen, setQuantModalOpen] = useState(false);
  const trackingType = getHabitTrackingType(habit);
  const todayLog = logs.find((log) => log.date === todayDate);
  const todayStatus = getHabitLogStatus(todayLog);

  const handleTodayCellClick = () => {
    if (trackingType === "quantifiable") {
      setQuantModalOpen(true);
      return;
    }

    const nextStatus =
      todayStatus === "clear" ? "done" : todayStatus === "done" ? "skipped" : todayStatus === "skipped" ? "clear" : "done";

    toggleMutation.mutate({ date: todayDate, status: nextStatus, valueText: null });
  };

  return (
    <>
      <div className="relative px-4 py-3 sm:px-5 sm:py-4">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundColor: habit.color }} />
        <div className="relative z-10 flex items-center gap-3 sm:gap-4">
          <HabitTodoCheckCell
            habitColor={habit.color}
            status={todayStatus}
            displayValue={hasHabitLogValue(todayLog) ? todayLog?.valueText ?? null : null}
            disabled={toggleMutation.isPending}
            onClick={handleTodayCellClick}
          />

          <div className="min-w-0 flex-1">
            <h3 className="font-display text-sm sm:text-base text-foreground leading-tight min-w-0 overflow-hidden break-words todo-title-clamp">
              {habit.title}
            </h3>
            {habit.description ? (
              <p className="font-body text-lg text-muted-foreground truncate">{habit.description}</p>
            ) : (
              <p className="font-body text-lg text-muted-foreground/70">No description</p>
            )}
          </div>

          {showActions && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onMoveUp}
                disabled={!canMoveUp || isReordering}
                className="w-9 h-9 flex items-center justify-center hover:bg-muted border-2 border-transparent hover:border-border pixel-button-lite disabled:opacity-40 disabled:cursor-not-allowed"
                title="Move up"
                aria-label={`Move ${habit.title} up`}
              >
                <ArrowUp className="w-4 h-4 text-muted-foreground" />
              </button>

              <button
                type="button"
                onClick={onMoveDown}
                disabled={!canMoveDown || isReordering}
                className="w-9 h-9 flex items-center justify-center hover:bg-muted border-2 border-transparent hover:border-border pixel-button-lite disabled:opacity-40 disabled:cursor-not-allowed"
                title="Move down"
                aria-label={`Move ${habit.title} down`}
              >
                <ArrowDown className="w-4 h-4 text-muted-foreground" />
              </button>

              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="w-9 h-9 flex items-center justify-center hover:bg-muted border-2 border-transparent hover:border-border pixel-button-lite"
                title="Edit habit"
                aria-label={`Edit ${habit.title}`}
              >
                <Settings2 className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      </div>

      <HabitForm habit={habit} open={isEditing} onOpenChange={setIsEditing} />
      {trackingType === "quantifiable" && (
        <QuantifiableLogModal
          open={quantModalOpen}
          onOpenChange={setQuantModalOpen}
          habit={habit}
          date={todayDate}
          currentValueText={todayLog?.valueText ?? null}
          isPending={toggleMutation.isPending}
          onSubmit={(payload) => toggleMutation.mutate(payload)}
        />
      )}
    </>
  );
}

function TodayTodoList({
  habits,
  selectedDate,
  showActions,
  isReordering,
  onMoveHabit,
  onPreviousDay,
  onNextDay,
  onSelectDate,
  canGoNextDay,
}: {
  habits: Habit[];
  selectedDate: string;
  showActions: boolean;
  isReordering: boolean;
  onMoveHabit: (fromIndex: number, toIndex: number) => void;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onSelectDate: (date: string) => void;
  canGoNextDay: boolean;
}) {
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const selectedDateObject = new Date(`${selectedDate}T00:00:00`);
  const dayOffsetFromToday = differenceInCalendarDays(startOfToday(), selectedDateObject);
  const todoHeaderLabel =
    dayOffsetFromToday <= 0
      ? "Today's to-do"
      : dayOffsetFromToday === 1
        ? "Yesterday's to-do"
        : "Previous to-do";

  return (
    <div className="pixel-box p-0 bg-card relative overflow-hidden">
      <div className="absolute inset-0 opacity-5 pointer-events-none bg-gradient-to-b from-primary/10 to-transparent" />
      <div className="relative z-10">
        <div className="px-4 py-3 sm:px-5 sm:py-4 border-b-4 border-border/60 bg-background/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-[10px] sm:text-xs text-foreground">{todoHeaderLabel}</p>
            <div className="flex items-center gap-2">
              {dayOffsetFromToday !== 0 && (
                <button
                  type="button"
                  onClick={() => onSelectDate(format(startOfToday(), "yyyy-MM-dd"))}
                  className="w-8 h-8 flex items-center justify-center border-2 border-border/50 bg-background/10 hover:bg-muted/40"
                  title="Back to today"
                  aria-label="Back to today"
                >
                  <RotateCcw className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
              <button
                type="button"
                onClick={onPreviousDay}
                className="w-8 h-8 flex items-center justify-center border-2 border-border/50 bg-background/10 hover:bg-muted/40"
                title="Previous day"
                aria-label="Previous day"
              >
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>

              <p className="font-body text-lg text-muted-foreground min-w-[150px] text-center">
                {format(selectedDateObject, "EEEE, MMM d")}
              </p>

              <button
                type="button"
                onClick={onNextDay}
                disabled={!canGoNextDay}
                className="w-8 h-8 flex items-center justify-center border-2 border-border/50 bg-background/10 hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Next day"
                aria-label="Next day"
              >
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const input = dateInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
                  if (!input) return;
                  if (typeof input.showPicker === "function") {
                    input.showPicker();
                    return;
                  }
                  input.click();
                }}
                className="w-8 h-8 flex items-center justify-center border-2 border-border/50 bg-background/10 hover:bg-muted/40 relative"
                title="Choose a date"
                aria-label="Choose a date"
              >
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
                <input
                  ref={dateInputRef}
                  type="date"
                  value={selectedDate}
                  max={format(startOfToday(), "yyyy-MM-dd")}
                  onChange={(e) => {
                    if (e.target.value) onSelectDate(e.target.value);
                  }}
                  className="absolute inset-0 opacity-0 pointer-events-none"
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </div>

        <div>
          {habits.map((habit, index) => (
            <div key={habit.id} className={index > 0 ? "border-t-2 border-border/40" : ""}>
              <TodayTodoHabitRow
                habit={habit}
                todayDate={selectedDate}
                showActions={showActions}
                canMoveUp={index > 0}
                canMoveDown={index < habits.length - 1}
                onMoveUp={() => onMoveHabit(index, index - 1)}
                onMoveDown={() => onMoveHabit(index, index + 1)}
                isReordering={isReordering}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatsCalendarHabitLabelCell({
  habit,
  isFirstRow,
}: {
  habit: Habit;
  isFirstRow: boolean;
}) {
  return (
    <div
      className={`h-12 px-3 flex items-center bg-card/95 ${isFirstRow ? "" : "border-t-2 border-border/30"}`}
      title={habit.title}
    >
      <div className="flex items-start gap-2 min-w-0">
        <div className="w-3 h-3 border-2 border-border shrink-0 mt-1" style={{ backgroundColor: habit.color }} />
        <div className="min-w-0">
          <p
            className="font-display text-[9px] sm:text-[10px] text-foreground leading-tight truncate max-w-[140px] sm:max-w-[156px]"
            title={habit.title}
          >
            {habit.title}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatsCalendarCellsRow({
  habit,
  buckets,
  isFirstRow,
}: {
  habit: Habit;
  buckets: StatsBucket[];
  isFirstRow: boolean;
}) {
  const { data: logs = [], isLoading } = useHabitLogs(habit.id);
  const completedDateSet = new Set(logs.filter((log) => isHabitLogDone(log)).map((log) => log.date));
  const emptyCellBg = getHabitCellBackground(habit.color);

  return (
    <div className={`flex h-12 items-center bg-transparent ${isFirstRow ? "" : "border-t-2 border-border/30"}`}>
      {buckets.map((bucket) => {
        if (isLoading) {
          return (
            <div key={bucket.key} className="px-1 py-2 shrink-0">
              <div className="w-8 h-8 border-2 border-border/40 bg-background/20 animate-pulse" />
            </div>
          );
        }

        const completedCount = bucket.dateKeys.reduce(
          (count, dateKey) => count + (completedDateSet.has(dateKey) ? 1 : 0),
          0,
        );
        const ratio = bucket.dateKeys.length > 0 ? completedCount / bucket.dateKeys.length : 0;
        const isCompletedInBucket = completedCount > 0;
        const isPartialCompletionInBucket =
          bucket.dateKeys.length > 1 && completedCount > 0 && completedCount < bucket.dateKeys.length;
        const backgroundColor = isCompletedInBucket ? rgbaFromHex(habit.color, 0.16 + ratio * 0.36) : emptyCellBg;

        return (
          <div key={bucket.key} className="px-1 py-2 shrink-0">
            <div
              className="w-8 h-8 border-2 border-border/50 flex items-center justify-center"
              style={{
                backgroundColor,
                boxShadow: isCompletedInBucket ? `inset 0px -2px 0px 0px ${habit.color}60` : "none",
              }}
              title={`${habit.title} - ${bucket.label}: ${completedCount}/${bucket.dateKeys.length}`}
            >
              {isCompletedInBucket && (
                <img
                  src={isPartialCompletionInBucket ? starNotOkImg : starOkImg}
                  alt=""
                  aria-hidden="true"
                  className="w-4 h-4 object-contain"
                  style={{ imageRendering: "pixelated", opacity: 0.9 + ratio * 0.1 }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatsCalendarMatrix({
  habits,
  granularity,
  onGranularityChange,
  anchorDate,
  onAnchorDateChange,
}: {
  habits: Habit[];
  granularity: StatsGranularity;
  onGranularityChange: (granularity: StatsGranularity) => void;
  anchorDate: string;
  onAnchorDateChange: (date: string) => void;
}) {
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const parsedAnchorDate = new Date(`${anchorDate}T00:00:00`);
  const safeAnchorDate = Number.isNaN(parsedAnchorDate.getTime()) ? startOfToday() : parsedAnchorDate;
  const buckets = buildStatsBuckets(granularity, safeAnchorDate);
  const granularityOptions: StatsGranularity[] = ["day", "week", "month"];
  const todayStart = startOfToday();
  const todayAnchorDate = format(todayStart, "yyyy-MM-dd");
  const isCurrentPeriod =
    granularity === "day"
      ? format(safeAnchorDate, "yyyy-MM-dd") === todayAnchorDate
      : granularity === "week"
        ? startOfWeek(safeAnchorDate, { weekStartsOn: 1 }).getTime() === startOfWeek(todayStart, { weekStartsOn: 1 }).getTime()
        : startOfMonth(safeAnchorDate).getTime() === startOfMonth(todayStart).getTime();

  return (
    <div className="pixel-box p-4 md:p-5 bg-card relative overflow-hidden">
      <div className="absolute inset-0 opacity-6 pointer-events-none bg-gradient-to-b from-secondary/10 to-transparent" />
      <div className="relative z-10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-display text-[10px] sm:text-xs text-foreground">Global Completion Calendar</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!isCurrentPeriod && (
              <button
                type="button"
                onClick={() => onAnchorDateChange(todayAnchorDate)}
                className="pixel-button px-3 py-2 flex items-center justify-center bg-transparent border-primary"
                title="Back to current period"
                aria-label="Back to current period"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {granularityOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onGranularityChange(option)}
                className={`pixel-button px-3 py-2 ${
                  granularity === option ? "bg-primary/20 border-accent text-foreground" : "bg-transparent border-primary"
                }`}
                aria-pressed={granularity === option}
              >
                <span className="text-[9px] sm:text-[10px]">{option === "day" ? "Day" : option === "week" ? "Week" : "Month"}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                const input = dateInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
                if (!input) return;
                if (typeof input.showPicker === "function") {
                  input.showPicker();
                  return;
                }
                input.click();
              }}
              className="pixel-button px-3 py-2 flex items-center gap-2 bg-transparent border-primary"
              title={
                granularity === "day"
                  ? "Jump to a date"
                  : granularity === "week"
                    ? "Jump to a week (pick any day in the week)"
                    : "Jump to a month (pick any day in the month)"
              }
              aria-label="Choose calendar date"
            >
              <CalendarDays className="w-4 h-4" />
              <span className="text-[9px] sm:text-[10px]">
                {granularity === "day" ? "Jump date" : granularity === "week" ? "Jump week" : "Jump month"}
              </span>
              <input
                ref={dateInputRef}
                type="date"
                value={anchorDate}
                max={format(startOfToday(), "yyyy-MM-dd")}
                onChange={(e) => {
                  if (e.target.value) onAnchorDateChange(e.target.value);
                }}
                className="absolute opacity-0 pointer-events-none w-0 h-0"
                tabIndex={-1}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        <div className="border-2 border-border/30 bg-background/5">
          <div className="grid grid-cols-[180px_minmax(0,1fr)]">
            <div className="border-r-2 border-border/30">
              <div className="h-12 border-b-2 border-border/40 bg-card/95" />
              {habits.map((habit, index) => (
                <StatsCalendarHabitLabelCell
                  key={`label-${habit.id}`}
                  habit={habit}
                  isFirstRow={index === 0}
                />
              ))}
            </div>

            <div className="overflow-x-auto overflow-y-hidden">
              <div className="min-w-max">
                <div className="flex h-12 items-center border-b-2 border-border/40 bg-card/40">
                  {buckets.map((bucket) => (
                    <div key={bucket.key} className="px-1 py-2 shrink-0">
                      <div className="w-8 text-center">
                        {granularity === "month" ? (
                          <span className="font-display text-[8px] text-muted-foreground opacity-90">
                            {bucket.label}
                          </span>
                        ) : (
                          <div className="flex flex-col items-center justify-center leading-none">
                            <span className="font-display text-[8px] text-muted-foreground opacity-95">
                              {bucket.label.split(" ")[0]}
                            </span>
                            <span className="font-display text-[7px] text-muted-foreground opacity-80 mt-[2px]">
                              {bucket.label.split(" ")[1]}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {habits.map((habit, index) => (
                  <StatsCalendarCellsRow
                    key={`cells-${habit.id}`}
                    habit={habit}
                    buckets={buckets}
                    isFirstRow={index === 0}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HabitStatsCard({
  habit,
  recentDates,
  todayDate,
  visibleMetrics,
}: {
  habit: Habit;
  recentDates: Set<string>;
  todayDate: string;
  visibleMetrics: StatsMetricVisibility;
}) {
  const { data: logs = [], isLoading } = useHabitLogs(habit.id);

  const completedLogs = logs.filter((log) => isHabitLogDone(log));
  const completedDateSet = new Set(completedLogs.map((log) => log.date));
  const completedLast7 = completedLogs.filter((log) => recentDates.has(log.date)).length;
  const recent30Dates = new Set(
    Array.from({ length: 30 }, (_, i) => format(subDays(startOfToday(), i), "yyyy-MM-dd")),
  );
  const completedLast30 = completedLogs.filter((log) => recent30Dates.has(log.date)).length;

  const completedDatesSorted = Array.from(completedDateSet).sort();
  const habitFrequencyPeriod = ((habit as Habit & { frequencyPeriod?: string | null }).frequencyPeriod ?? "day") as
    | "day"
    | "week"
    | "month"
    | "quarter"
    | "year";
  const habitFrequencyCount = Math.max(
    1,
    Number((habit as Habit & { frequencyCount?: number | null }).frequencyCount ?? 1) || 1,
  );
  const currentStreak = computeCurrentPeriodStreak(completedDatesSorted, habitFrequencyPeriod, habitFrequencyCount);
  const bestStreak = computeBestPeriodStreak(completedDatesSorted, habitFrequencyPeriod, habitFrequencyCount);
  const streakUnitSuffix =
    habitFrequencyPeriod === "day"
      ? "d"
      : habitFrequencyPeriod === "week"
        ? "w"
        : habitFrequencyPeriod === "month"
          ? "m"
          : habitFrequencyPeriod === "quarter"
            ? "q"
            : "y";

  const createdAtDate = new Date(habit.createdAt as unknown as string);
  const safeCreatedAtDate = Number.isNaN(createdAtDate.getTime()) ? startOfToday() : createdAtDate;
  const createdAtStart = startOfDay(safeCreatedAtDate);
  const earliestCompletedDateKey = completedDatesSorted[0];
  const earliestCompletedDate = earliestCompletedDateKey
    ? new Date(`${earliestCompletedDateKey}T00:00:00`)
    : null;
  const hasValidEarlierCompletedDate = Boolean(
    earliestCompletedDate &&
      !Number.isNaN(earliestCompletedDate.getTime()) &&
      earliestCompletedDate < createdAtStart,
  );
  const effectiveStartDate = hasValidEarlierCompletedDate && earliestCompletedDate
    ? startOfDay(earliestCompletedDate)
    : createdAtStart;
  const effectiveStartKey = format(effectiveStartDate, "yyyy-MM-dd");
  const totalDaysSinceStarted = Math.max(1, differenceInCalendarDays(startOfToday(), effectiveStartDate) + 1);
  const completedSinceStarted = Array.from(completedDateSet).filter(
    (date) => date >= effectiveStartKey && date <= todayDate,
  ).length;
  const rateSinceStarted = Math.min(100, Math.round((completedSinceStarted / totalDaysSinceStarted) * 100));

  const metricCards = [
    {
      key: "last7" as const,
      label: "Last 7 Days",
      value: `${completedLast7}/7`,
    },
    {
      key: "last30" as const,
      label: "Last 30 Days",
      value: `${completedLast30}/30`,
    },
    {
      key: "currentStreak" as const,
      label: "Current Streak",
      value: `${currentStreak}${streakUnitSuffix}`,
    },
    {
      key: "bestStreak" as const,
      label: "Best Streak",
      value: `${bestStreak}${streakUnitSuffix}`,
    },
    {
      key: "rate" as const,
      label: "Rate Since Started",
      value: `${rateSinceStarted}%`,
    },
  ].filter((metric) => visibleMetrics[metric.key]);

  return (
    <div className="pixel-box p-4 md:p-5 bg-card relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundColor: habit.color }} />
      <div className="relative z-10 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-4 h-4 border-2 border-border shrink-0 mt-1" style={{ backgroundColor: habit.color }} />
          <div className="min-w-0">
            <h3 className="font-display text-sm sm:text-base text-foreground leading-tight break-words">
              {habit.title}
            </h3>
          </div>
        </div>

        {isLoading ? (
          <p className="font-body text-lg text-muted-foreground">Loading stats...</p>
        ) : metricCards.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {metricCards.map((metric) => (
              <div key={metric.key} className="border-2 border-border/60 bg-background/20 px-3 py-2">
                <p className="font-display text-[9px] text-muted-foreground">{metric.label}</p>
                <p className="font-body text-xl text-foreground">{metric.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="font-body text-lg text-muted-foreground">No stats selected (use the pencil to choose).</p>
        )}

      </div>
    </div>
  );
}

export default function Home() {
  const { data: habits = [], isLoading, isError } = useHabits();
  const reorderHabits = useReorderHabits();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeView, setActiveView] = useState<HomeViewMode>("weekly");
  const [showViewTools, setShowViewTools] = useState(false);
  const [statsGranularity, setStatsGranularity] = useState<StatsGranularity>("day");
  const [statsCalendarAnchorDate, setStatsCalendarAnchorDate] = useState(() => format(startOfToday(), "yyyy-MM-dd"));
  const [selectedTodoDate, setSelectedTodoDate] = useState(() => format(startOfToday(), "yyyy-MM-dd"));
  const [selectedWeeklyAnchorDate, setSelectedWeeklyAnchorDate] = useState(() => format(startOfToday(), "yyyy-MM-dd"));
  const [showDayBackgroundScene, setShowDayBackgroundScene] = useState(false);
  const [selectedHabitForStats, setSelectedHabitForStats] = useState<Habit | null>(null);
  const [visibleStatsMetrics, setVisibleStatsMetrics] = useState<StatsMetricVisibility>({
    last7: true,
    last30: true,
    currentStreak: true,
    bestStreak: true,
    rate: true,
  });
  const [isTrackerSettingsOpen, setIsTrackerSettingsOpen] = useState(false);
  const [trackerSettingsInitialSection, setTrackerSettingsInitialSection] = useState<TrackerSettingsSection>("account");
  const [pikachuSprints, setPikachuSprints] = useState<PikachuSprint[]>([]);
  const pikachuSprintIdRef = useRef(0);
  const pikachuTimeoutsRef = useRef<number[]>([]);
  const [showMewEasterEgg] = useState(() => Math.random() < 0.2);
  const [showMewShinyEasterEgg] = useState(() => !showMewEasterEgg && Math.random() < 0.1);
  const backgroundStars = [
    { id: 0, top: "2%", left: "44%", size: 420, opacity: 0.52, rotation: -6 },
    { id: 1, top: "38%", left: "-4%", size: 500, opacity: 0.48, rotation: 8 },
    { id: 2, top: "58%", left: "77%", size: 500, opacity: 0.5, rotation: -10 },
  ];

  const openTrackerSettings = (section: TrackerSettingsSection = "account") => {
    setTrackerSettingsInitialSection(section);
    setIsTrackerSettingsOpen(true);
  };

  const moveHabit = (fromIndex: number, toIndex: number) => {
    if (reorderHabits.isPending) return;
    if (toIndex < 0 || toIndex >= habits.length || fromIndex === toIndex) return;

    const reordered = [...habits];
    const [movedHabit] = reordered.splice(fromIndex, 1);
    if (!movedHabit) return;
    reordered.splice(toIndex, 0, movedHabit);

    reorderHabits.mutate({ orderedIds: reordered.map((habit) => habit.id) });
  };

  const todayDate = format(startOfToday(), "yyyy-MM-dd");
  const todayStart = startOfToday();
  const currentWeekStart = startOfWeek(todayStart, { weekStartsOn: 1 });
  const parsedWeeklyAnchorDate = new Date(`${selectedWeeklyAnchorDate}T00:00:00`);
  const safeWeeklyAnchorDate = Number.isNaN(parsedWeeklyAnchorDate.getTime()) ? todayStart : parsedWeeklyAnchorDate;
  const selectedWeekStart = startOfWeek(safeWeeklyAnchorDate, { weekStartsOn: 1 });
  const isCurrentWeeklyPeriod = selectedWeekStart.getTime() === currentWeekStart.getTime();
  const canGoNextWeek = selectedWeekStart.getTime() < currentWeekStart.getTime();
  const allStatsVisible = Object.values(visibleStatsMetrics).every(Boolean);
  const noStatsVisible = Object.values(visibleStatsMetrics).every((value) => !value);
  const recentDates = new Set(
    Array.from({ length: 7 }, (_, i) => format(subDays(todayStart, i), "yyyy-MM-dd")),
  );

  useEffect(() => {
    return () => {
      pikachuTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      pikachuTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const maybeOpenImportSettings = () => {
      if (window.sessionStorage.getItem("pixel-heart.openTrackerSettingsImport") !== "1") return;
      window.sessionStorage.removeItem("pixel-heart.openTrackerSettingsImport");
      setTrackerSettingsInitialSection("import-export");
      setIsTrackerSettingsOpen(true);
    };

    maybeOpenImportSettings();
    window.addEventListener("pixel-heart:openTrackerSettingsImport", maybeOpenImportSettings);
    return () => {
      window.removeEventListener("pixel-heart:openTrackerSettingsImport", maybeOpenImportSettings);
    };
  }, []);

  const triggerPerfectWeekPikachuSprint = () => {
    const totalDurationMs = 3000 + Math.floor(Math.random() * 1001); // 3-4s total
    const runnerCount = 1;
    const sprintId = pikachuSprintIdRef.current++;

    const runners: PikachuRunner[] = Array.from({ length: runnerCount }, (_, index) => {
      const delayMs = 0;
      const tailPadding = 120 + Math.floor(Math.random() * 280);
      const durationMs = Math.max(1100, totalDurationMs - delayMs - tailPadding);

      return {
        id: index,
        top: `${10 + Math.random() * 72}%`,
        delayMs,
        durationMs,
        scale: 0.75 + Math.random() * 0.45,
      };
    });

    const fireworkCount = 5 + Math.floor(Math.random() * 6);
    const fireworks: FireworkBurst[] = Array.from({ length: fireworkCount }, (_, index) => {
      const delayMs = 150 + Math.floor(Math.random() * Math.max(250, totalDurationMs - 700));
      const durationMs = 1000 + Math.floor(Math.random() * 700);
      return {
        id: index,
        top: `${8 + Math.random() * 70}%`,
        left: `${8 + Math.random() * 84}%`,
        delayMs,
        durationMs,
        scale: 0.8 + Math.random() * 0.8,
        opacity: 0.7 + Math.random() * 0.25,
      };
    });

    const sprint: PikachuSprint = {
      id: sprintId,
      totalDurationMs,
      runners,
      fireworks,
    };

    setPikachuSprints((current) => [...current, sprint]);

    const removeTimeoutId = window.setTimeout(() => {
      setPikachuSprints((current) => current.filter((item) => item.id !== sprintId));
      pikachuTimeoutsRef.current = pikachuTimeoutsRef.current.filter((id) => id !== removeTimeoutId);
    }, totalDurationMs + 350);

    pikachuTimeoutsRef.current.push(removeTimeoutId);
  };

  const toggleStatsMetric = (metric: StatsMetricKey) => {
    setVisibleStatsMetrics((current) => ({
      ...current,
      [metric]: !current[metric],
    }));
  };

  const setAllStatsMetrics = (visible: boolean) => {
    setVisibleStatsMetrics({
      last7: visible,
      last30: visible,
      currentStreak: visible,
      bestStreak: visible,
      rate: visible,
    });
  };

  const moveSelectedTodoDateBy = (daysOffset: number) => {
    setSelectedTodoDate((current) => {
      const currentDate = new Date(`${current}T00:00:00`);
      const nextDate = addDays(currentDate, daysOffset);
      const today = startOfToday();
      if (nextDate > today) return format(today, "yyyy-MM-dd");
      return format(nextDate, "yyyy-MM-dd");
    });
  };

  const moveSelectedWeeklyWeekBy = (weeksOffset: number) => {
    setSelectedWeeklyAnchorDate((current) => {
      const currentDate = new Date(`${current}T00:00:00`);
      const safeCurrentDate = Number.isNaN(currentDate.getTime()) ? todayStart : currentDate;
      const nextDate = addDays(safeCurrentDate, weeksOffset * 7);
      const nextWeekStart = startOfWeek(nextDate, { weekStartsOn: 1 });

      if (nextWeekStart > currentWeekStart) {
        return todayDate;
      }

      return format(nextDate, "yyyy-MM-dd");
    });
  };

  const jumpToTodayTodoView = () => {
    setSelectedTodoDate(todayDate);
    setActiveView("today");
  };

  const openDayBackgroundScene = () => {
    setIsCreateOpen(false);
    setShowDayBackgroundScene(true);
  };

  const closeDayBackgroundScene = () => {
    setShowDayBackgroundScene(false);
  };

  if (showDayBackgroundScene) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center">
            <div className="pixel-box bg-card/70 p-8 text-center">
              <p className="font-display text-sm text-foreground glow-text">Loading Pokegame...</p>
            </div>
          </div>
        }
      >
        <LazyPokegamePage onBack={closeDayBackgroundScene} />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen pb-24 relative overflow-hidden">
      <button
        type="button"
        onClick={openDayBackgroundScene}
        className="pokeball-standalone-button absolute top-4 left-4 sm:top-5 sm:left-5 z-20 bg-transparent border-0 p-0 m-0 cursor-pointer"
        title="Open day background scene"
        aria-label="Open day background scene"
      >
        <img
          src={pokeballImg}
          alt=""
          aria-hidden="true"
          className="w-10 h-10 object-contain quest-ball-icon"
        />
      </button>

      {pikachuSprints.length > 0 && (
        <div className="fixed inset-0 z-[90] pointer-events-none overflow-hidden">
          {pikachuSprints.map((sprint) => (
            <div key={sprint.id} className="absolute inset-0">
              {sprint.fireworks.map((burst) => (
                <div
                  key={`fw-${sprint.id}-${burst.id}`}
                  className="absolute will-change-transform will-change-opacity"
                  style={{
                    top: burst.top,
                    left: burst.left,
                    animation: `fireworks-pop ${burst.durationMs}ms ease-out ${burst.delayMs}ms both`,
                  }}
                >
                  <div style={{ transform: `scale(${burst.scale})` }}>
                    <img
                      src={`${fireworksGif}?fw=${sprint.id}-${burst.id}`}
                      alt=""
                      aria-hidden="true"
                      className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 object-contain drop-shadow-xl"
                      style={{ imageRendering: "pixelated", opacity: burst.opacity }}
                    />
                  </div>
                </div>
              ))}
              {sprint.runners.map((runner) => (
                <div
                  key={`${sprint.id}-${runner.id}`}
                  className="absolute left-0 will-change-transform"
                  style={{
                    top: runner.top,
                    animation: `pikachu-run-left-to-right ${runner.durationMs}ms linear ${runner.delayMs}ms both`,
                  }}
                >
                  <div style={{ transform: `scale(${runner.scale})` }}>
                    <img
                      src={`${runningPikachuRightGif}?run=${sprint.id}-${runner.id}`}
                      alt=""
                      aria-hidden="true"
                      className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 object-contain drop-shadow-xl"
                      style={{ imageRendering: "pixelated" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Background Hero Image */}
      <div 
        className="absolute inset-0 z-0 opacity-25 pointer-events-none animate-clouds-scroll"
        style={{ backgroundImage: `url(${cloudsBackgroundImg})` }}
      />
      <div className="absolute inset-0 z-[1] pointer-events-none">
        {backgroundStars.map((star) => (
          <img
            key={star.id}
            src={starsGif}
            alt=""
            aria-hidden="true"
            className="absolute object-contain"
            style={{
              top: star.top,
              left: star.left,
              width: `${star.size}px`,
              height: `${star.size}px`,
              opacity: star.opacity,
              transform: `rotate(${star.rotation}deg)`,
            }}
          />
        ))}
      </div>
      
      <div className="relative z-10 pt-12 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <button
          type="button"
          onClick={() => openTrackerSettings("account")}
          className="md:hidden absolute top-3 right-4 sm:right-6 pixel-button !bg-card/80 backdrop-blur-sm border-border/80 px-3 py-3 flex items-center justify-center text-muted-foreground"
          title="Settings"
          aria-label="Open tracker settings"
        >
          <Cog className="w-4 h-4" />
        </button>
        {/* Header Area */}
        <header className="mb-12 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={jumpToTodayTodoView}
              className="bg-transparent border-0 p-0 m-0 shrink-0 cursor-pointer"
              title="Go to today's to-do"
              aria-label="Go to today's to-do"
            >
              <img
                src={moonImg}
                alt="Moon"
                className="w-24 h-24 object-contain animate-float drop-shadow-xl self-start mt-2"
                style={{
                  filter:
                    "drop-shadow(0 0 5px rgba(250, 204, 21, 0.62)) drop-shadow(0 0 12px rgba(250, 204, 21, 0.38)) drop-shadow(0 0 20px rgba(255, 236, 153, 0.2))",
                }}
              />
            </button>
            <div>
              <h1>
                <button
                  type="button"
                  onClick={jumpToTodayTodoView}
                  className="font-display text-3xl sm:text-5xl text-foreground leading-tight glow-text bg-transparent border-0 p-0 m-0 cursor-pointer text-left"
                  title="Go to today's to-do"
                >
                  Space Missions
                </button>
              </h1>
              <p
                className="font-body text-lg sm:text-xl text-foreground mt-2 tracking-wide"
                style={{
                  textShadow:
                    "0 -1px 6px rgba(45, 212, 191, 0.7), 0 -2px 12px rgba(45, 212, 191, 0.5), 0 0 20px rgba(45, 212, 191, 0.45), 0 0 30px rgba(45, 212, 191, 0.3)",
                }}
              >
                BECAUSE I LOVE YOU TO THE MOON AND BACK ❤︎
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsCreateOpen(true)}
                  className="hidden sm:flex pixel-button bg-transparent border-primary text-foreground items-center gap-3 text-lg px-8 py-4 whitespace-nowrap glow-text"
                >
                  <Plus className="w-6 h-6 stroke-[4]" />
                  <span>New Mission</span>
                </button>
                <button
                  type="button"
                  onClick={() => openTrackerSettings("account")}
                  className="hidden md:flex pixel-button !bg-card/80 backdrop-blur-sm border-border/80 px-4 py-4 items-center justify-center text-muted-foreground"
                  title="Settings"
                  aria-label="Open tracker settings"
                >
                  <Cog className="w-5 h-5" />
                </button>
              </div>
            </div>

            {showMewEasterEgg && (
              <img
                src={mewGif}
                alt="Mew"
                className="w-28 h-28 sm:w-32 sm:h-32 ml-2 object-contain animate-float pointer-events-none"
              />
            )}

            {showMewShinyEasterEgg && (
              <img
                src={mewShinyGif}
                alt="Shiny Mew"
                className="w-28 h-28 sm:w-32 sm:h-32 ml-2 object-contain animate-float pointer-events-none"
              />
            )}
          </div>
        </header>

        {/* Main Content */}
        <main>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-6">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent animate-spin"></div>
              <p className="font-display text-primary text-sm animate-pulse">Scanning Galaxy...</p>
            </div>
          ) : isError ? (
            <div className="pixel-box bg-destructive/20 p-10 text-center border-destructive">
              <p className="font-display text-destructive text-xl">System Failure! Connection Lost.</p>
              <p className="font-body text-2xl mt-4">Please restart your engine (refresh page).</p>
            </div>
          ) : habits.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-4 pb-24 text-center space-y-4">
              <div className="relative animate-float">
                <img
                  src={noHabitsKarpImg}
                  alt="No habits yet"
                  className="w-72 h-72 object-contain drop-shadow-2xl"
                />
              </div>
              
              <div className="space-y-4 max-w-lg">
                <h2 className="font-display text-2xl text-foreground glow-text">Your Mission Log is Empty</h2>
                <p className="font-body text-2xl text-muted-foreground">
                  The universe is waiting for you! Launch your first mission and conquer your daily habits.
                </p>
              </div>
              
              <button 
                onClick={() => setIsCreateOpen(true)}
                className="pixel-button bg-primary text-foreground text-xl px-10 py-5 mt-6 animate-pulse"
              >
                Launch First Mission
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <ViewModeMenu
                activeView={activeView}
                onChange={setActiveView}
                showViewTools={showViewTools}
                onToggleViewTools={() => setShowViewTools((v) => !v)}
                onCreateHabit={() => setIsCreateOpen(true)}
                isCurrentWeeklyPeriod={isCurrentWeeklyPeriod}
                onPreviousWeek={() => moveSelectedWeeklyWeekBy(-1)}
                onNextWeek={() => moveSelectedWeeklyWeekBy(1)}
                onResetWeek={() => setSelectedWeeklyAnchorDate(todayDate)}
                canGoNextWeek={canGoNextWeek}
              />

              {activeView === "weekly" && (
                <div className="space-y-3">
                  {habits.map((habit, index) => (
                    <div key={habit.id}>
                      <HabitRow 
                        habit={habit} 
                        daysToMap={DAYS_TO_SHOW}
                        weekAnchorDate={selectedWeeklyAnchorDate}
                        canMoveUp={index > 0}
                        canMoveDown={index < habits.length - 1}
                        onMoveUp={() => moveHabit(index, index - 1)}
                        onMoveDown={() => moveHabit(index, index + 1)}
                        isReordering={reorderHabits.isPending}
                        showActions={showViewTools}
                        onPerfectWeek={triggerPerfectWeekPikachuSprint}
                        onOpenStats={(clickedHabit) => setSelectedHabitForStats(clickedHabit)}
                      />
                    </div>
                  ))}
                  {habits.length > 5 && (
                    <div className="flex justify-center pt-2">
                      <button
                        type="button"
                        onClick={() => setIsCreateOpen(true)}
                        className="pixel-button bg-transparent border-primary text-foreground flex items-center gap-3 text-base sm:text-lg px-6 py-3 whitespace-nowrap glow-text"
                      >
                        <Plus className="w-5 h-5 sm:w-6 sm:h-6 stroke-[4]" />
                        <span>New Mission</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeView === "today" && (
                <div className="space-y-4">
                  <TodayTodoList
                    habits={habits}
                    selectedDate={selectedTodoDate}
                    showActions={showViewTools}
                    isReordering={reorderHabits.isPending}
                    onMoveHabit={moveHabit}
                    onPreviousDay={() => moveSelectedTodoDateBy(-1)}
                    onNextDay={() => moveSelectedTodoDateBy(1)}
                    onSelectDate={(date) => setSelectedTodoDate(date)}
                    canGoNextDay={selectedTodoDate < todayDate}
                  />
                  {habits.length > 5 && (
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => setIsCreateOpen(true)}
                        className="pixel-button bg-transparent border-primary text-foreground flex items-center gap-3 text-base sm:text-lg px-6 py-3 whitespace-nowrap glow-text"
                      >
                        <Plus className="w-5 h-5 sm:w-6 sm:h-6 stroke-[4]" />
                        <span>New Mission</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeView === "stats" && (
                <div className="space-y-4">
                  {showViewTools && (
                    <div className="pixel-box p-4 bg-card/90">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-display text-[10px] sm:text-xs text-foreground">Stats Display Settings</p>
                          <p className="font-body text-lg text-muted-foreground">Choose which stats appear on each habit card</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setAllStatsMetrics(true)}
                            className={`pixel-button px-3 py-2 ${
                              allStatsVisible
                                ? "bg-primary/20 border-accent text-foreground"
                                : "bg-background/10 border-border/40 text-muted-foreground"
                            }`}
                            aria-pressed={allStatsVisible}
                            title="Show all stats"
                          >
                            <span className="text-[9px] sm:text-[10px]">ALL</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllStatsMetrics(false)}
                            className={`pixel-button px-3 py-2 ${
                              noStatsVisible
                                ? "bg-primary/20 border-accent text-foreground"
                                : "bg-background/10 border-border/40 text-muted-foreground"
                            }`}
                            aria-pressed={noStatsVisible}
                            title="Hide all stats"
                          >
                            <span className="text-[9px] sm:text-[10px]">NONE</span>
                          </button>
                          {([
                            ["last7", "Last 7 Days"],
                            ["last30", "Last 30 Days"],
                            ["currentStreak", "Current Streak"],
                            ["bestStreak", "Best Streak"],
                            ["rate", "Rate Since Started"],
                          ] as const).map(([metricKey, label]) => (
                            <button
                              key={metricKey}
                              type="button"
                              onClick={() => toggleStatsMetric(metricKey)}
                              className={`pixel-button px-3 py-2 ${
                                visibleStatsMetrics[metricKey]
                                  ? "bg-primary/20 border-accent text-foreground"
                                  : "bg-background/10 border-border/40 text-muted-foreground opacity-60"
                              }`}
                              aria-pressed={visibleStatsMetrics[metricKey]}
                            >
                              <span className="text-[9px] sm:text-[10px]">{label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <StatsCalendarMatrix
                    habits={habits}
                    granularity={statsGranularity}
                    onGranularityChange={setStatsGranularity}
                    anchorDate={statsCalendarAnchorDate}
                    onAnchorDateChange={setStatsCalendarAnchorDate}
                  />
                  {habits.map((habit) => (
                    <HabitStatsCard
                      key={habit.id}
                      habit={habit}
                      recentDates={recentDates}
                      todayDate={todayDate}
                      visibleMetrics={visibleStatsMetrics}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        <HabitForm 
          open={isCreateOpen} 
          onOpenChange={setIsCreateOpen} 
        />
        {isTrackerSettingsOpen ? (
          <Suspense fallback={null}>
            <LazyTrackerSettingsModal
              open={isTrackerSettingsOpen}
              onClose={() => setIsTrackerSettingsOpen(false)}
              initialSection={trackerSettingsInitialSection}
            />
          </Suspense>
        ) : null}
        {selectedHabitForStats ? (
          <Suspense fallback={null}>
            <LazyHabitStatsModal
              habit={selectedHabitForStats}
              open={Boolean(selectedHabitForStats)}
              onOpenChange={(nextOpen) => {
                if (!nextOpen) setSelectedHabitForStats(null);
              }}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
