import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type Habit, type HabitLogInput } from "@shared/routes";
import {
  doesQuantifiableValueMeetGoal,
  formatTimeOfDayValueText,
  getHabitUnitLabel,
  parseTimeOfDayValueText,
} from "@shared/habit-config";
import moonImg from "@assets/moon.png";

interface QuantifiableLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  habit: Habit;
  date: string;
  currentValueText?: string | null;
  isPending?: boolean;
  onSubmit: (payload: HabitLogInput) => void;
}

export function QuantifiableLogModal({
  open,
  onOpenChange,
  habit,
  date,
  currentValueText,
  isPending = false,
  onSubmit,
}: QuantifiableLogModalProps) {
  const [valueText, setValueText] = useState(currentValueText ?? "");
  const [isNextDay, setIsNextDay] = useState(false);

  useEffect(() => {
    if (!open) return;
    const isTimeOfDayHabit = (habit as Habit & { quantUnitPreset?: string | null }).quantUnitPreset === "time_of_day";
    if (isTimeOfDayHabit) {
      const parsed = parseTimeOfDayValueText(currentValueText ?? null);
      setValueText(parsed?.timeText ?? (currentValueText ?? ""));
      setIsNextDay(parsed?.isNextDay ?? false);
      return;
    }

    setValueText(currentValueText ?? "");
    setIsNextDay(false);
  }, [open, currentValueText, date, habit]);

  const unitLabel = useMemo(() => getHabitUnitLabel(habit), [habit]);
  const isTimeOfDay = (habit as Habit & { quantUnitPreset?: string | null }).quantUnitPreset === "time_of_day";
  const effectiveValueText = useMemo(
    () => (isTimeOfDay ? formatTimeOfDayValueText(valueText, isNextDay) : valueText),
    [isTimeOfDay, valueText, isNextDay],
  );
  const previewMeetsGoal = doesQuantifiableValueMeetGoal(habit, effectiveValueText);
  const dateObj = new Date(`${date}T00:00:00`);
  const dateLabel = Number.isNaN(dateObj.getTime()) ? date : format(dateObj, "EEEE d MMM yyyy");

  const handleSave = () => {
    onSubmit({
      date,
      status: "done",
      valueText: effectiveValueText.trim() || null,
    });
    onOpenChange(false);
  };

  const handleSkip = () => {
    onSubmit({ date, status: "skipped", valueText: null });
    onOpenChange(false);
  };

  const handleClear = () => {
    onSubmit({ date, status: "clear", valueText: null });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-4 border-border rounded-none p-0 overflow-hidden bg-card sm:max-w-[440px]"
        style={{ boxShadow: "8px 8px 0px 0px hsl(var(--border))" }}
      >
        <div className="bg-primary/10 border-b-4 border-border px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-foreground">Log Value</DialogTitle>
            <DialogDescription className="font-body text-lg text-muted-foreground mt-2">
              {habit.title} • {dateLabel}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pt-4 pb-6 space-y-5">
          <div className="space-y-2">
            <label className="font-display text-sm text-foreground">Value ({unitLabel})</label>
            <input
              value={valueText}
              onChange={(e) => setValueText(e.target.value)}
              className="pixel-input"
              placeholder={isTimeOfDay ? "HH:mm" : "e.g. 30"}
              inputMode={isTimeOfDay ? "numeric" : "decimal"}
              disabled={isPending}
            />
            {isTimeOfDay ? (
              <label className="flex items-center gap-2 text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isNextDay}
                  onChange={(e) => setIsNextDay(e.target.checked)}
                  className="accent-cyan-400"
                  disabled={isPending}
                />
                <span className="font-body text-lg">The next day (lendemain)</span>
              </label>
            ) : null}
            <p className={`font-body text-sm ${previewMeetsGoal ? "text-primary" : "text-muted-foreground"}`}>
              {previewMeetsGoal ? "This will count as validated." : "Saved value will not count as validated yet."}
            </p>
            {isTimeOfDay && valueText.trim() ? (
              <p className="font-body text-xs text-muted-foreground/90">Saved as: {effectiveValueText.trim()}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !valueText.trim()}
              className="pixel-button bg-primary text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save value
            </button>

            <button
              type="button"
              onClick={handleSkip}
              disabled={isPending}
              className="pixel-button bg-transparent border-primary text-foreground flex items-center justify-center gap-2"
            >
              <img src={moonImg} alt="" aria-hidden="true" className="w-4 h-4 object-contain" />
              Skip day
            </button>

            <button
              type="button"
              onClick={handleClear}
              disabled={isPending}
              className="pixel-button bg-transparent border-primary text-muted-foreground"
            >
              Clear
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
