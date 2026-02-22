import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useCreateHabit, useUpdateHabit, useDeleteHabit } from "@/hooks/use-habits";
import { type Habit } from "@shared/routes";
import { Palette, Trash2 } from "lucide-react";

const formSchema = z.object({
  title: z.string().min(1, "Title is required").max(50, "Title is too long"),
  description: z.string().max(100, "Description is too long").optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
});

type FormValues = z.infer<typeof formSchema>;

const COLORS = [
  "#f87171", // Red/Pink
  "#fb923c", // Orange
  "#facc15", // Yellow
  "#4ade80", // Green
  "#60a5fa", // Blue
  "#c084fc", // Indigo
  "#f472b6", // Purple
  "#fb7185", // Pink
];

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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: habit?.title || "",
      description: habit?.description || "",
      color: habit?.color || COLORS[0],
    },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: habit.id, ...data });
      } else {
        await createMutation.mutateAsync(data);
      }
      onOpenChange(false);
      form.reset();
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
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (!val && !isEditing) form.reset();
    }}>
      <DialogContent className="border-4 border-border rounded-none p-0 overflow-hidden bg-card sm:max-w-[425px]" style={{ boxShadow: '8px 8px 0px 0px hsl(var(--border))' }}>
        <div className="bg-primary/10 border-b-4 border-border p-6">
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

        <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="font-display text-sm text-foreground">Quest Name</label>
            <input
              {...form.register("title")}
              className="pixel-input"
              placeholder="e.g. Drink Water"
              disabled={isPending}
            />
            {form.formState.errors.title && (
              <p className="text-destructive font-body text-sm mt-1">{form.formState.errors.title.message}</p>
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
            <label className="font-display text-sm text-foreground">Quest Color</label>
            <div className="flex flex-wrap gap-3">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => form.setValue("color", c)}
                  className={`w-10 h-10 border-4 transition-transform ${
                    selectedColor === c 
                      ? "border-border scale-110 shadow-[2px_2px_0px_0px_#333]" 
                      : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: c }}
                  title={`Select color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={isPending}
              className="pixel-button bg-primary text-primary-foreground flex-1 flex items-center justify-center gap-2"
            >
              {isPending ? "Saving..." : (isEditing ? "Save Changes" : "Create Quest!")}
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
        </form>
      </DialogContent>
    </Dialog>
  );
}
