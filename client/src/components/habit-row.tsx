import { useMemo, useState, type CSSProperties } from "react";
import { addDays, format, startOfToday, startOfWeek, subDays } from "date-fns";
import { type Habit } from "@shared/routes";
import { getHabitTrackingType, parseTimeOfDayValueText } from "@shared/habit-config";
import {
  getHabitLogStatus,
  hasHabitLogValue,
  isHabitLogDone,
  isHabitLogRecordedOnly,
  isHabitLogSkipped,
  useHabitLogs as useLogs,
  useToggleHabitLog as useToggle,
} from "@/hooks/use-habit-logs";
import { getQuestIconSrc } from "@/lib/habit-icons";
import { ArrowDown, ArrowUp, Settings2 } from "lucide-react";
import { HabitForm } from "./habit-form";
import { QuantifiableLogModal } from "./quantifiable-log-modal";
import starOkImg from "@assets/star_ok.png";
import starNotOkImg from "@assets/star_notok.png";
import moonImg from "@assets/moon.png";

interface HabitRowProps {
  habit: Habit;
  daysToMap: number;
  weekAnchorDate?: string;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isReordering?: boolean;
  showActions?: boolean;
  onPerfectWeek?: (habit: Habit) => void;
  onOpenStats?: (habit: Habit) => void;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return null;

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  if ([r, g, b].some(Number.isNaN)) return null;
  return { r, g, b };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rgbToHsl(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  let { r, g, b } = rgb;
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number) {
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;
  const hue = ((h % 360) + 360) % 360;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hue < 60) [rPrime, gPrime, bPrime] = [c, x, 0];
  else if (hue < 120) [rPrime, gPrime, bPrime] = [x, c, 0];
  else if (hue < 180) [rPrime, gPrime, bPrime] = [0, c, x];
  else if (hue < 240) [rPrime, gPrime, bPrime] = [0, x, c];
  else if (hue < 300) [rPrime, gPrime, bPrime] = [x, 0, c];
  else [rPrime, gPrime, bPrime] = [c, 0, x];

  const toHex = (value: number) =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(rPrime)}${toHex(gPrime)}${toHex(bPrime)}`;
}

function rgbaFromHex(hex: string, alpha: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(255, 255, 255, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function mixHexWithWhite(hex: string, amount = 0.45) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const mix = (channel: number) =>
    Math.round(channel + (255 - channel) * amount)
      .toString(16)
      .padStart(2, "0");

  return `#${mix(rgb.r)}${mix(rgb.g)}${mix(rgb.b)}`;
}

function mixHexWithBlack(hex: string, amount = 0.85) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const mix = (channel: number) =>
    Math.round(channel * (1 - amount))
      .toString(16)
      .padStart(2, "0");

  return `#${mix(rgb.r)}${mix(rgb.g)}${mix(rgb.b)}`;
}

function mixHex(baseHex: string, tintHex: string, amount = 0.5) {
  const base = hexToRgb(baseHex);
  const tint = hexToRgb(tintHex);
  if (!base || !tint) return tintHex;

  const mix = (baseChannel: number, tintChannel: number) =>
    Math.round(baseChannel + (tintChannel - baseChannel) * amount)
      .toString(16)
      .padStart(2, "0");

  return `#${mix(base.r, tint.r)}${mix(base.g, tint.g)}${mix(base.b, tint.b)}`;
}

function adjustHexHsl(
  hex: string,
  options: {
    hShift?: number;
    sShift?: number;
    lShift?: number;
    hSet?: number;
    sMul?: number;
    lMul?: number;
  } = {},
) {
  const hsl = rgbToHsl(hex);
  if (!hsl) return hex;

  let h = hsl.h + (options.hShift ?? 0);
  let s = hsl.s * (options.sMul ?? 1) + (options.sShift ?? 0);
  let l = hsl.l * (options.lMul ?? 1) + (options.lShift ?? 0);

  if (typeof options.hSet === "number") h = options.hSet;

  return hslToHex(h, clamp(s, 0, 100), clamp(l, 0, 100));
}

function getWeeklyHoverBorderHex(habitColor: string, baseTintedBgHex: string) {
  const normalized = habitColor.toLowerCase();
  const baseHover = mixHexWithBlack(baseTintedBgHex, 0.18);

  switch (normalized) {
    case "#f87171": // Red: OK
      return baseHover;
    case "#fb923c": // Orange -> more yellow and more desaturated
      return adjustHexHsl(baseHover, { hShift: 14, sShift: -10, lShift: 1 });
    case "#facc15": // Yellow -> more orange and lighter
      return adjustHexHsl(baseHover, { hSet: 30, sShift: 6, lShift: 9 });
    case "#4ade80": { // Green -> a touch more saturated and lighter
      const cyanSeed = mixHex("#2e0f3d", habitColor, 0.28);
      const cyanBase = mixHexWithBlack(cyanSeed, 0.16);
      return adjustHexHsl(cyanBase, { hSet: 202, sShift: -6, lShift: -8 });
    }
    case "#2dd4bf": { // Cyan -> darker, more desaturated, and a touch bluer
      const cyanSeed = mixHex("#2e0f3d", habitColor, 0.28);
      const cyanBase = mixHexWithBlack(cyanSeed, 0.16);
      return adjustHexHsl(cyanBase, { hSet: 228, sShift: -10, lShift: -10 });
    }
    case "#60a5fa": // Blue -> less violet
      return adjustHexHsl(baseHover, { hShift: -12, sShift: 6, lShift: -3 });
    case "#c084fc": // Violet -> a bit less saturated and slightly bluer
      return adjustHexHsl(baseHover, { hShift: -6, sShift: -10 });
    default:
      return baseHover;
  }
}

export function HabitRow({
  habit,
  daysToMap,
  weekAnchorDate,
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
  isReordering = false,
  showActions = false,
  onPerfectWeek,
  onOpenStats,
}: HabitRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [quantModalDate, setQuantModalDate] = useState<string | null>(null);
  const { data: logs = [], isLoading } = useLogs(habit.id);
  const toggleMutation = useToggle(habit.id);
  const trackingType = getHabitTrackingType(habit);
  const isQuantTimeOfDay = trackingType === "quantifiable" && habit.quantUnitPreset === "time_of_day";

  // Weekly view uses the current Monday->Sunday week; other views keep a rolling window ending today.
  const days = useMemo(() => {
    const today = startOfToday();

    if (daysToMap === 7) {
      const parsedAnchor = weekAnchorDate ? new Date(`${weekAnchorDate}T00:00:00`) : today;
      const safeAnchor = Number.isNaN(parsedAnchor.getTime()) ? today : parsedAnchor;
      const monday = startOfWeek(safeAnchor, { weekStartsOn: 1 });
      return Array.from({ length: 7 }).map((_, i) => {
        const date = addDays(monday, i);
        return format(date, "yyyy-MM-dd");
      });
    }

    return Array.from({ length: daysToMap }).map((_, i) => {
      const date = subDays(today, daysToMap - 1 - i);
      return format(date, 'yyyy-MM-dd');
    });
  }, [daysToMap, weekAnchorDate]);
  const todayKey = format(startOfToday(), "yyyy-MM-dd");

  const handleYesNoCycle = (date: string) => {
    const currentLog = logs.find((log) => log.date === date);
    const currentStatus = getHabitLogStatus(currentLog);
    const nextStatus =
      currentStatus === "clear" ? "done" : currentStatus === "done" ? "skipped" : currentStatus === "skipped" ? "clear" : "done";

    const completedCountInVisibleDays = days.reduce((count, day) => {
      const dayLog = logs.find((log) => log.date === day);
      return count + (isHabitLogDone(dayLog) ? 1 : 0);
    }, 0);

    const reachesPerfectWeek =
      daysToMap === 7 &&
      nextStatus === "done" &&
      !isHabitLogDone(currentLog) &&
      completedCountInVisibleDays === days.length - 1;

    toggleMutation.mutate(
      { date, status: nextStatus, valueText: null },
      {
        onSuccess: () => {
          if (reachesPerfectWeek) {
            onPerfectWeek?.(habit);
          }
        },
      },
    );
  };

  const handleCellClick = (date: string) => {
    if (trackingType === "quantifiable") {
      setQuantModalDate(date);
      return;
    }
    handleYesNoCycle(date);
  };

  const glowColorLight = mixHexWithWhite(habit.color, 0.5);
  const glowGradient = `linear-gradient(90deg, ${rgbaFromHex(habit.color, 0.18)} 0%, ${rgbaFromHex(
    glowColorLight,
    0.14,
  )} 100%)`;
  const emptyCellBg = rgbaFromHex(mixHexWithBlack(habit.color, 0.9), 0.28);
  // Weekly-only card border: slightly darker than global borders, still lighter than the card shadow.
  const weeklyCardBorderColor = "hsl(var(--border-shadow) / 0.9)";
  const weeklyCardTintedBg = mixHex("#2e0f3d", habit.color, 0.1);
  const weeklyCardHoverBorderHex = getWeeklyHoverBorderHex(habit.color, weeklyCardTintedBg);
  const weeklyCardHoverBorderColor = rgbaFromHex(weeklyCardHoverBorderHex, 0.95);
  // Keep the original purple shadow tint, but darker for Weekly cards.
  const weeklyCardShadowColor = "hsl(262 32% 13% / 0.62)";
  const weeklyCardStyle: CSSProperties & Record<"--weekly-card-hover-border", string> = {
    borderColor: weeklyCardBorderColor,
    "--weekly-card-hover-border": weeklyCardHoverBorderColor,
    boxShadow: `4px 4px 0px 0px ${weeklyCardShadowColor}`,
  };

  return (
    <>
      <div className="weekly-habit-row flex flex-col md:flex-row items-stretch gap-3 md:gap-4">
        <div className="relative group/main flex-1 habit-main-card">
          <div
            className="absolute -inset-1 blur-md opacity-30 group-hover/main:opacity-90 transition duration-700 pointer-events-none"
            style={{ backgroundImage: glowGradient }}
          />
          <div
            className="pixel-box weekly-habit-card p-4 md:p-6 flex flex-col md:flex-row gap-6 items-center bg-card relative overflow-hidden flex-1"
            style={weeklyCardStyle}
          >
            {/* Subtle background color hint based on habit color */}
            <div 
              className="absolute inset-0 pointer-events-none" 
              style={{ backgroundColor: habit.color, opacity: 0.09 }} 
            />

            {/* Habit Info */}
            <div className="flex-1 w-full text-center md:text-left z-10 relative min-w-0 py-1 md:mt-1">
              <div className="flex items-start justify-center md:justify-start gap-3 mb-0 min-w-0">
                <div 
                  className="w-[30px] h-[30px] shrink-0 mt-0.5 flex items-center justify-center"
                >
                  <img
                    src={getQuestIconSrc(habit.icon)}
                    alt=""
                    aria-hidden="true"
                    className="w-[30px] h-[30px] object-contain quest-ball-icon"
                  />
                </div>
                {onOpenStats ? (
                  <button
                    type="button"
                    onClick={() => onOpenStats(habit)}
                    className="min-w-0 flex-1 text-left group/title"
                    title={`Open stats for ${habit.title}`}
                  >
                    <h3
                      className="font-display text-lg sm:text-xl text-foreground min-w-0 overflow-hidden break-words leading-tight habit-title-clamp group-hover/title:text-primary transition-colors"
                      title={habit.title}
                    >
                      {habit.title}
                    </h3>
                  </button>
                ) : (
                  <h3
                    className="font-display text-lg sm:text-xl text-foreground min-w-0 flex-1 overflow-hidden break-words leading-tight habit-title-clamp"
                    title={habit.title}
                  >
                    {habit.title}
                  </h3>
                )}
              </div>
              
              {habit.description && (
                <p className="font-body text-lg text-muted-foreground truncate md:pl-[42px]">
                  {habit.description}
                </p>
              )}
            </div>

            {/* Grid of Days */}
            <div className="flex gap-1.5 sm:gap-2 z-10">
              {days.map((dateStr) => {
                const log = logs.find(l => l.date === dateStr);
                const isCompleted = isHabitLogDone(log);
                const isSkipped = isHabitLogSkipped(log);
                const isRecorded = isHabitLogRecordedOnly(log);
                const showsValue = trackingType === "quantifiable" && hasHabitLogValue(log);
                const valueText = showsValue ? (log?.valueText ?? "") : null;
                const parsedTimeValue = isQuantTimeOfDay ? parseTimeOfDayValueText(valueText) : null;
                const cellValueText = parsedTimeValue?.timeText ?? valueText;
                
                // Is it today?
                const isToday = dateStr === todayKey;
                const dateObj = new Date(dateStr + 'T00:00:00'); // simple parse
                const dayName = format(dateObj, 'E').substring(0, 2); // 'Mo', 'Tu'

                return (
                  <div key={dateStr} className="flex flex-col items-center gap-1.5">
                    <span className={`font-display text-[9px] sm:text-[10px] ${isToday ? 'text-foreground glow-text' : 'text-muted-foreground opacity-80'}`}>
                      {dayName}
                    </span>
                    
                    <button
                      onClick={() => handleCellClick(dateStr)}
                      disabled={isLoading || toggleMutation.isPending && toggleMutation.variables?.date !== dateStr}
                      className={`
                        group/cell w-9 h-9 sm:w-10 sm:h-10 border-4 border-border flex items-center justify-center
                        transition-all duration-200 focus:outline-none 
                        ${isCompleted 
                          ? 'shadow-[inset_0px_-4px_0px_rgba(0,0,0,0.08)]' 
                          : 'hover:brightness-90'}
                      `}
                      style={{
                        borderColor: weeklyCardBorderColor,
                        boxShadow: isCompleted 
                          ? `inset 0px -3px 0px 0px ${habit.color}40, 2px 2px 0px 0px ${weeklyCardShadowColor}` 
                          : `2px 2px 0px 0px ${weeklyCardShadowColor}`,
                        backgroundColor: emptyCellBg,
                      }}
                      title={format(dateObj, 'MMM do, yyyy')}
                    >
                      {showsValue && !isSkipped && (
                        <span
                          className={`relative inline-flex items-center justify-center font-display leading-none ${
                            isRecorded ? "text-muted-foreground" : "text-foreground"
                          }`}
                          title={valueText ?? undefined}
                        >
                          {isQuantTimeOfDay && parsedTimeValue ? (
                            <span className="inline-flex flex-col items-center justify-center gap-[3px] leading-none -mt-0.5">
                              <span className="relative top-[3px] text-[8px] sm:text-[9px]">{parsedTimeValue.timeText.slice(0, 2)}</span>
                              <span className="text-[8px] sm:text-[9px]">{parsedTimeValue.timeText.slice(3, 5)}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] sm:text-[11px]">{(cellValueText ?? "").slice(0, 5)}</span>
                          )}
                          {parsedTimeValue?.isNextDay ? (
                            <span className="absolute -right-1.5 -top-1 text-[7px] leading-none text-foreground/90">+</span>
                          ) : null}
                        </span>
                      )}

                      {!showsValue && isCompleted && (
                        <div className="animate-pop">
                          <img
                            src={starOkImg}
                            alt=""
                            aria-hidden="true"
                            className="w-6 h-6 sm:w-7 sm:h-7 object-contain relative -top-px sm:-top-0.5"
                          />
                        </div>
                      )}

                      {isSkipped && (
                        <div className="animate-pop">
                          <img
                            src={moonImg}
                            alt=""
                            aria-hidden="true"
                            className="w-5 h-5 sm:w-6 sm:h-6 object-contain"
                          />
                        </div>
                      )}

                      {!isCompleted && !isSkipped && !showsValue && (
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
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={`relative group/actions ${showActions ? "block" : "hidden"}`}>
          <div
            className="absolute -inset-1 blur-md opacity-30 group-hover/actions:opacity-90 transition duration-700 pointer-events-none"
            style={{ backgroundImage: glowGradient }}
          />
          <div
            className="pixel-box weekly-habit-card bg-card relative overflow-hidden p-2 flex flex-row md:flex-col justify-center items-center gap-2 md:gap-1 md:min-w-[50px] md:h-full"
            style={weeklyCardStyle}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ backgroundColor: habit.color, opacity: 0.09 }}
            />

            <button
              type="button"
              onClick={onMoveUp}
              disabled={!canMoveUp || isReordering}
              className="relative z-10 w-10 h-10 md:w-8 md:h-8 flex items-center justify-center hover:bg-muted border-2 border-transparent hover:border-border pixel-button-lite disabled:opacity-40 disabled:cursor-not-allowed"
              title="Move up"
              aria-label={`Move ${habit.title} up`}
            >
              <ArrowUp className="w-4 h-4 text-muted-foreground" />
            </button>

            <button
              type="button"
              onClick={onMoveDown}
              disabled={!canMoveDown || isReordering}
              className="relative z-10 w-10 h-10 md:w-8 md:h-8 flex items-center justify-center hover:bg-muted border-2 border-transparent hover:border-border pixel-button-lite disabled:opacity-40 disabled:cursor-not-allowed"
              title="Move down"
              aria-label={`Move ${habit.title} down`}
            >
              <ArrowDown className="w-4 h-4 text-muted-foreground" />
            </button>

            <button 
              type="button"
              onClick={() => setIsEditing(true)}
              className="relative z-10 w-10 h-10 md:w-8 md:h-8 flex items-center justify-center hover:bg-muted border-2 border-transparent hover:border-border pixel-button-lite"
              title="Edit Habit"
              aria-label={`Edit ${habit.title}`}
            >
              <Settings2 className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>

      <HabitForm 
        habit={habit} 
        open={isEditing} 
        onOpenChange={setIsEditing} 
      />

      {trackingType === "quantifiable" && quantModalDate && (
        <QuantifiableLogModal
          open={Boolean(quantModalDate)}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setQuantModalDate(null);
          }}
          habit={habit}
          date={quantModalDate}
          currentValueText={logs.find((log) => log.date === quantModalDate)?.valueText ?? null}
          isPending={toggleMutation.isPending}
          onSubmit={(payload) => toggleMutation.mutate(payload)}
        />
      )}
    </>
  );
}
