import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useCreateHabit, useUpdateHabit, useDeleteHabit } from "@/hooks/use-habits";
import { DEFAULT_QUEST_ICON, QUEST_ICON_FILES, QUEST_ICON_OPTIONS } from "@/lib/habit-icons";
import { type Habit } from "@shared/routes";
import {
  HABIT_FREQUENCY_PERIODS,
  HABIT_GOAL_TYPES,
  HABIT_QUANT_UNIT_PRESETS,
  HABIT_TRACKING_TYPES,
  getHabitTrackingType,
} from "@shared/habit-config";
import { ChevronLeft, Palette, Ruler, Trash2 } from "lucide-react";

const habitTrackingTypeEnum = z.enum(HABIT_TRACKING_TYPES);
const habitFrequencyPeriodEnum = z.enum(HABIT_FREQUENCY_PERIODS);
const habitQuantUnitPresetEnum = z.enum(HABIT_QUANT_UNIT_PRESETS);
const habitGoalTypeEnum = z.enum(HABIT_GOAL_TYPES);

const formSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(100, "Title is too long"),
    description: z.string().max(100, "Description is too long").optional().nullable(),
    notes: z.string().max(500, "Notes are too long").optional().nullable(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
    icon: z.enum(QUEST_ICON_FILES),
    trackingType: habitTrackingTypeEnum,
    frequencyCount: z.coerce.number().int().min(1, "Min 1").max(999, "Max 999"),
    frequencyPeriod: habitFrequencyPeriodEnum,
    quantUnitPreset: habitQuantUnitPresetEnum.nullable().optional(),
    quantUnitCustom: z.string().max(30, "Unit is too long").optional().nullable(),
    quantTargetValue: z.string().max(16, "Target is too long").optional().nullable(),
    quantGoalType: habitGoalTypeEnum.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.trackingType !== "quantifiable") return;

    if (!data.quantUnitPreset) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quantUnitPreset"], message: "Unit is required" });
    }

    if (data.quantUnitPreset === "custom" && !data.quantUnitCustom?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quantUnitCustom"], message: "Custom unit is required" });
    }

    if (!data.quantGoalType) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quantGoalType"], message: "Goal type is required" });
    }

    const rawTarget = data.quantTargetValue?.trim() ?? "";
    if (!rawTarget) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quantTargetValue"], message: "Target is required" });
      return;
    }

    if (data.quantUnitPreset === "time_of_day") {
      if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(rawTarget)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quantTargetValue"], message: "Use HH:mm (e.g. 23:00)" });
      }
      return;
    }

    const parsed = Number(rawTarget.replace(",", "."));
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quantTargetValue"], message: "Enter a number" });
    }
  });

type FormValues = z.infer<typeof formSchema>;

type CreateStep = "pick-type" | "form";

const COLORS = [
  "#f87171",
  "#fb923c",
  "#facc15",
  "#4ade80",
  "#2dd4bf",
  "#60a5fa",
  "#c084fc",
];

const UNIT_PRESET_OPTIONS: Array<{ value: (typeof HABIT_QUANT_UNIT_PRESETS)[number]; label: string }> = [
  { value: "count", label: "Unit" },
  { value: "km", label: "km" },
  { value: "hours", label: "h" },
  { value: "minutes", label: "min" },
  { value: "time_of_day", label: "H de la journée" },
  { value: "custom", label: "Custom" },
];

const FREQUENCY_PERIOD_LABELS: Record<(typeof HABIT_FREQUENCY_PERIODS)[number], string> = {
  day: "jour",
  week: "semaine",
  month: "mois",
  quarter: "trimestre",
  year: "année",
};

const GOAL_TYPE_LABELS: Record<(typeof HABIT_GOAL_TYPES)[number], string> = {
  at_least: "Au moins",
  at_most: "Au plus",
};

function getGoalTypeLabelForUnit(
  goalType: (typeof HABIT_GOAL_TYPES)[number],
  unitPreset: (typeof HABIT_QUANT_UNIT_PRESETS)[number] | null | undefined,
) {
  if (unitPreset === "time_of_day") {
    return goalType === "at_most" ? "Avant" : "Après";
  }
  return GOAL_TYPE_LABELS[goalType];
}

interface HabitFormProps {
  habit?: Habit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HabitForm({ habit, open, onOpenChange }: HabitFormProps) {
  const isEditing = !!habit;
  const createMutation = useCreateHabit();
  const updateMutation = useUpdateHabit();
  const deleteMutation = useDeleteHabit();
  const [createStep, setCreateStep] = useState<CreateStep>(isEditing ? "form" : "pick-type");

  const formDefaults = useMemo<FormValues>(() => ({
    title: habit?.title || "",
    description: habit?.description || "",
    notes: (habit as Habit & { notes?: string | null })?.notes || "",
    color: habit?.color || COLORS[0],
    icon: (habit?.icon as (typeof QUEST_ICON_FILES)[number] | undefined) || DEFAULT_QUEST_ICON,
    trackingType: getHabitTrackingType(habit ?? {}),
    frequencyCount:
      typeof (habit as Habit & { frequencyCount?: number | null })?.frequencyCount === "number"
        ? Math.max(1, (habit as Habit & { frequencyCount?: number | null }).frequencyCount!)
        : 1,
    frequencyPeriod:
      ((habit as Habit & { frequencyPeriod?: (typeof HABIT_FREQUENCY_PERIODS)[number] | null })?.frequencyPeriod as
        | (typeof HABIT_FREQUENCY_PERIODS)[number]
        | undefined) || "day",
    quantUnitPreset:
      ((habit as Habit & { quantUnitPreset?: (typeof HABIT_QUANT_UNIT_PRESETS)[number] | null })?.quantUnitPreset as
        | (typeof HABIT_QUANT_UNIT_PRESETS)[number]
        | null
        | undefined) ?? null,
    quantUnitCustom: (habit as Habit & { quantUnitCustom?: string | null })?.quantUnitCustom || "",
    quantTargetValue: (habit as Habit & { quantTargetValue?: string | null })?.quantTargetValue || "",
    quantGoalType:
      ((habit as Habit & { quantGoalType?: (typeof HABIT_GOAL_TYPES)[number] | null })?.quantGoalType as
        | (typeof HABIT_GOAL_TYPES)[number]
        | null
        | undefined) ?? null,
  }), [habit]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: formDefaults,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(formDefaults);
    setCreateStep(isEditing ? "form" : "pick-type");
  }, [open, habit?.id, isEditing, form, formDefaults]);

  const onSubmit = async (data: FormValues) => {
    const payload = {
      ...data,
      description: data.description?.trim() ? data.description.trim() : null,
      notes: data.notes?.trim() ? data.notes.trim() : null,
      quantUnitPreset: data.trackingType === "quantifiable" ? data.quantUnitPreset ?? null : null,
      quantUnitCustom:
        data.trackingType === "quantifiable" && data.quantUnitPreset === "custom" && data.quantUnitCustom?.trim()
          ? data.quantUnitCustom.trim()
          : null,
      quantTargetValue:
        data.trackingType === "quantifiable" && data.quantTargetValue?.trim() ? data.quantTargetValue.trim() : null,
      quantGoalType: data.trackingType === "quantifiable" ? data.quantGoalType ?? null : null,
    };

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: habit.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onOpenChange(false);
      form.reset(formDefaults);
      setCreateStep(isEditing ? "form" : "pick-type");
    } catch (error) {
      console.error("Failed to save habit", error);
    }
  };

  const handleDelete = async () => {
    if (!habit) return;
    if (window.confirm("Are you sure you want to delete this habit? All progress will be lost!")) {
      await deleteMutation.mutateAsync(habit.id);
      onOpenChange(false);
    }
  };

  const selectedColor = form.watch("color");
  const selectedIcon = form.watch("icon") ?? DEFAULT_QUEST_ICON;
  const selectedTrackingType = form.watch("trackingType");
  const selectedQuantUnitPreset = form.watch("quantUnitPreset");
  const titleValue = form.watch("title") ?? "";
  const titleLength = titleValue.length;
  const showTitleCounter = titleLength > 0;
  const showTitleLengthError = titleLength > 100;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const renderTypePickerStep = () => (
    <div className="px-6 pt-4 pb-6 space-y-5">
      <p className="font-body text-lg text-muted-foreground">Choose how this quest should be tracked.</p>
      <div className="grid grid-cols-1 gap-4">
        <button
          type="button"
          onClick={() => {
            form.setValue("trackingType", "yes_no", { shouldDirty: true });
            form.setValue("frequencyCount", 1, { shouldDirty: true });
            form.setValue("frequencyPeriod", "day", { shouldDirty: true });
            setCreateStep("form");
          }}
          className="pixel-box p-4 text-left bg-card/60 hover:bg-card/80 transition-colors"
        >
          <p className="font-display text-sm text-foreground">Habit “Oui / Non”</p>
          <p className="font-body text-lg text-muted-foreground mt-1">
            Ex: As-tu joué aux échecs ? T&apos;es-tu réveillé avant 8h ?
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            form.setValue("trackingType", "quantifiable", { shouldDirty: true });
            form.setValue("frequencyCount", 1, { shouldDirty: true });
            form.setValue("frequencyPeriod", "day", { shouldDirty: true });
            form.setValue("quantUnitPreset", "count", { shouldDirty: true });
            form.setValue("quantGoalType", "at_least", { shouldDirty: true });
            setCreateStep("form");
          }}
          className="pixel-box p-4 text-left bg-card/60 hover:bg-card/80 transition-colors"
        >
          <p className="font-display text-sm text-foreground">Habit “Quantifiable”</p>
          <p className="font-body text-lg text-muted-foreground mt-1">
            Ex: Combien de pages lues ? Quelle distance ? Combien de temps ?
          </p>
        </button>
      </div>
    </div>
  );

  const renderFormStep = () => (
    <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 pt-4 pb-0 space-y-6">
      {!isEditing && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setCreateStep("pick-type")}
            className="pixel-button-lite border-2 border-border/60 px-3 py-2 flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="font-display text-[10px]">Back</span>
          </button>
          <span className="font-display text-[10px] text-muted-foreground">
            {selectedTrackingType === "quantifiable" ? "Quantifiable" : "Yes / No"}
          </span>
        </div>
      )}

      <div className="space-y-2">
        <label className="font-display text-sm text-foreground">Quest Name</label>
        <input {...form.register("title")} className="pixel-input" placeholder="e.g. Drink Water" disabled={isPending} />
        {(showTitleCounter || form.formState.errors.title) && (
          <p
            className={`font-body text-sm mt-1 ${
              showTitleLengthError || form.formState.errors.title ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {showTitleCounter ? `${titleLength}/100` : form.formState.errors.title?.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="font-display text-sm text-foreground">Description (Optional)</label>
        <input
          {...form.register("description")}
          className="pixel-input"
          placeholder="e.g. 8 glasses a day!"
          disabled={isPending}
        />
        {form.formState.errors.description && (
          <p className="text-destructive font-body text-sm mt-1">{form.formState.errors.description.message}</p>
        )}
      </div>

      <div className="space-y-3">
        <label className="font-display text-sm text-foreground">Frequency Goal</label>
        <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 items-center">
          <input
            type="number"
            min={1}
            max={999}
            {...form.register("frequencyCount", { valueAsNumber: true })}
            className="pixel-input"
            disabled={isPending}
          />
          <div className="relative">
            <select
              {...form.register("frequencyPeriod")}
              className="pixel-input appearance-none pr-8"
              disabled={isPending}
            >
              {HABIT_FREQUENCY_PERIODS.map((period) => (
                <option key={period} value={period}>
                  {`x / ${FREQUENCY_PERIOD_LABELS[period]}`}
                </option>
              ))}
            </select>
            <span className="absolute right-2 top-1/2 -translate-y-1/2 font-display text-[10px] text-muted-foreground pointer-events-none">
              \/
            </span>
          </div>
        </div>
        {(form.formState.errors.frequencyCount || form.formState.errors.frequencyPeriod) && (
          <p className="text-destructive font-body text-sm mt-1">
            {form.formState.errors.frequencyCount?.message || form.formState.errors.frequencyPeriod?.message}
          </p>
        )}
      </div>

      {selectedTrackingType === "quantifiable" && (
        <div className="space-y-4 border-2 border-border/40 bg-background/10 p-4">
          <div className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-muted-foreground" />
            <p className="font-display text-xs text-foreground">Quantifiable Goal</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="font-display text-sm text-foreground">Unit</label>
              <div className="relative">
                <select
                  {...form.register("quantUnitPreset")}
                  className="pixel-input appearance-none pr-8"
                  disabled={isPending}
                >
                  {UNIT_PRESET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 font-display text-[10px] text-muted-foreground pointer-events-none">
                  \/
                </span>
              </div>
              {form.formState.errors.quantUnitPreset && (
                <p className="text-destructive font-body text-sm mt-1">{form.formState.errors.quantUnitPreset.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="font-display text-sm text-foreground">Goal Type</label>
              <div className="relative">
                <select
                  value={form.watch("quantGoalType") ?? ""}
                  onChange={(e) => form.setValue("quantGoalType", (e.target.value || null) as FormValues["quantGoalType"], { shouldDirty: true })}
                  className="pixel-input appearance-none pr-8"
                  disabled={isPending}
                >
                  {HABIT_GOAL_TYPES.map((goalType) => (
                    <option key={goalType} value={goalType}>
                      {getGoalTypeLabelForUnit(goalType, selectedQuantUnitPreset)}
                    </option>
                  ))}
                </select>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 font-display text-[10px] text-muted-foreground pointer-events-none">
                  \/
                </span>
              </div>
              {form.formState.errors.quantGoalType && (
                <p className="text-destructive font-body text-sm mt-1">{form.formState.errors.quantGoalType.message}</p>
              )}
            </div>
          </div>

          {selectedQuantUnitPreset === "custom" && (
            <div className="space-y-2">
              <label className="font-display text-sm text-foreground">Custom Unit Label</label>
              <input
                {...form.register("quantUnitCustom")}
                className="pixel-input"
                placeholder="e.g. pages"
                disabled={isPending}
              />
              {form.formState.errors.quantUnitCustom && (
                <p className="text-destructive font-body text-sm mt-1">{form.formState.errors.quantUnitCustom.message}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="font-display text-sm text-foreground">Target</label>
            <input
              {...form.register("quantTargetValue")}
              className="pixel-input"
              placeholder={selectedQuantUnitPreset === "time_of_day" ? "HH:mm (e.g. 23:00)" : "e.g. 15"}
              inputMode={selectedQuantUnitPreset === "time_of_day" ? "numeric" : "decimal"}
              disabled={isPending}
            />
            {form.formState.errors.quantTargetValue && (
              <p className="text-destructive font-body text-sm mt-1">{form.formState.errors.quantTargetValue.message}</p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <label className="font-display text-sm text-foreground">Quest Color</label>
        <div className="flex flex-wrap gap-3">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => form.setValue("color", c)}
              className={`w-10 h-10 border-4 transition-transform ${
                selectedColor === c ? "border-border scale-110 shadow-[2px_2px_0px_0px_#333]" : "border-transparent hover:scale-105"
              }`}
              style={{ backgroundColor: c }}
              title={`Select color ${c}`}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="font-display text-sm text-foreground">Quest Icon</label>
        <div className="grid grid-cols-4 gap-3">
          {QUEST_ICON_OPTIONS.map((iconOption) => (
            <button
              key={iconOption.file}
              type="button"
              onClick={() => form.setValue("icon", iconOption.file, { shouldDirty: true })}
              className={`relative h-14 border-4 bg-card/70 flex items-center justify-center transition-transform ${
                selectedIcon === iconOption.file
                  ? "border-border scale-[1.03] shadow-[2px_2px_0px_0px_#333]"
                  : "border-border/40 hover:border-border/80 hover:scale-[1.02]"
              }`}
              title={`Select icon ${iconOption.label}`}
              aria-pressed={selectedIcon === iconOption.file}
            >
              <img src={iconOption.src} alt="" aria-hidden="true" className="w-9 h-9 object-contain quest-ball-icon" />
            </button>
          ))}
        </div>
        <p className="font-body text-sm text-muted-foreground">
          Selected: {QUEST_ICON_OPTIONS.find((option) => option.file === selectedIcon)?.label ?? "White (Default)"}
        </p>
      </div>

      <div className="space-y-2">
        <label className="font-display text-sm text-foreground">Notes (Optional)</label>
        <textarea
          {...form.register("notes")}
          className="pixel-input min-h-[84px] resize-y"
          placeholder="A small note about this habit..."
          disabled={isPending}
        />
        {form.formState.errors.notes && (
          <p className="text-destructive font-body text-sm mt-1">{form.formState.errors.notes.message}</p>
        )}
      </div>

      <div className="sticky bottom-0 -mx-6 px-6 py-4 mt-2 border-t-2 border-border/40 bg-card shadow-[0_-2px_0px_0px_hsl(var(--border-shadow))] relative z-20 after:content-[''] after:absolute after:left-0 after:right-0 after:-bottom-6 after:h-6 after:bg-card">
        <div className="flex gap-4">
        <button
          type="submit"
          disabled={isPending}
          className="pixel-button bg-primary text-foreground flex-1 flex items-center justify-center gap-2"
        >
          {isPending ? "Saving..." : isEditing ? "Save Changes" : "Create Quest!"}
        </button>

        {isEditing && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="pixel-button bg-destructive text-destructive-foreground flex items-center justify-center px-4"
            title="Delete Quest"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
        </div>
      </div>
    </form>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        onOpenChange(val);
        if (!val && !isEditing) {
          form.reset();
          setCreateStep("pick-type");
        }
      }}
    >
      <DialogContent
        className="border-4 border-border rounded-none p-0 overflow-hidden bg-card sm:max-w-[500px] max-h-[90vh] flex flex-col"
        style={{ boxShadow: "8px 8px 0px 0px hsl(var(--border))" }}
      >
        <div className="bg-primary/10 border-b-4 border-border px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-foreground flex items-center gap-2">
              {isEditing ? "Edit Quest" : "New Quest"}
              <Palette className="w-5 h-5 text-primary" />
            </DialogTitle>
            <DialogDescription className="font-body text-lg text-muted-foreground mt-2">
              {isEditing ? "Update your habit details below." : "What new adventure are we starting today?"}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {!isEditing && createStep === "pick-type" ? renderTypePickerStep() : renderFormStep()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
